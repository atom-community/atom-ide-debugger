"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _assert = _interopRequireDefault(require("assert"));

var _mouseToPosition = require("@atom-ide-community/nuclide-commons-atom/mouse-to-position");

var _event = require("@atom-ide-community/nuclide-commons/event");

var _observable = require("@atom-ide-community/nuclide-commons/observable");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _ContextMenu = require("@atom-ide-community/nuclide-commons-atom/ContextMenu");

var _classnames = _interopRequireDefault(require("classnames"));

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

var _constants = require("./constants");

var _featureConfig = _interopRequireDefault(require("@atom-ide-community/nuclide-commons-atom/feature-config"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Handles displaying breakpoints and processing events for a single text
 * editor.
 */
class BreakpointDisplayController {
  constructor(delegate, service, editor) {
    this._service = void 0;
    this._delegate = void 0;
    this._disposables = void 0;
    this._editor = void 0;
    this._gutter = void 0;
    this._markers = void 0;
    this._markerInfo = void 0;
    this._lastShadowBreakpointMarker = void 0;
    this._boundGlobalMouseMoveHandler = void 0;
    this._boundCreateContextMenuHandler = void 0;
    this._debugging = void 0;
    this._delegate = delegate;
    this._disposables = new _UniversalDisposable.default();
    this._service = service;
    this._editor = editor;
    this._markers = [];
    this._markerInfo = new Map();
    this._lastShadowBreakpointMarker = null;
    this._boundGlobalMouseMoveHandler = this._handleGlobalMouseLeave.bind(this);
    this._boundCreateContextMenuHandler = this._handleCreateContextMenu.bind(this);
    this._debugging = this._isDebugging(); // Configure the gutter.

    const gutter = editor.addGutter({
      name: "debugger-breakpoint",
      visible: false,
      // Priority is -200 by default and 0 is the line number
      priority: -1100
    });

    const debuggerModel = this._service.getModel();

    this._gutter = gutter;

    this._disposables.addUntilDestroyed(editor, gutter.onDidDestroy(this._handleGutterDestroyed.bind(this)), editor.observeGutters(this._registerGutterMouseHandlers.bind(this)), _rxjsCompatUmdMin.Observable.merge((0, _event.observableFromSubscribeFunction)(debuggerModel.onDidChangeBreakpoints.bind(debuggerModel)), (0, _event.observableFromSubscribeFunction)(this._service.viewModel.onDidChangeDebuggerFocus.bind(this._service.viewModel))) // Debounce to account for bulk updates and not block the UI
    .let((0, _observable.fastDebounce)(10)).startWith(null).subscribe(this._update.bind(this)), this._editor.onDidDestroy(this._handleTextEditorDestroyed.bind(this)), this._registerEditorContextMenuHandler());
  }

  _isDebugging() {
    return this._service.getModel().getProcesses().some(process => process.debuggerMode !== _constants.DebuggerMode.STOPPED);
  }

  _registerEditorContextMenuHandler() {
    const editorElement = atom.views.getView(this._editor);
    editorElement.addEventListener("contextmenu", this._boundCreateContextMenuHandler);
    return new _UniversalDisposable.default(() => editorElement.removeEventListener("contextmenu", this._boundCreateContextMenuHandler));
  }

  _registerGutterMouseHandlers(gutter) {
    const gutterView = atom.views.getView(gutter);

    if (gutter.name !== "line-number" && gutter.name !== "debugger-breakpoint") {
      return;
    }

    const boundClickHandler = this._handleGutterClick.bind(this);

    const boundMouseMoveHandler = this._handleGutterMouseMove.bind(this);

    const boundMouseEnterHandler = this._handleGutterMouseEnter.bind(this);

    const boundMouseLeaveHandler = this._handleGutterMouseLeave.bind(this); // Add mouse listeners gutter for setting breakpoints.


    gutterView.addEventListener("click", boundClickHandler);
    gutterView.addEventListener("mousemove", boundMouseMoveHandler);
    gutterView.addEventListener("mouseenter", boundMouseEnterHandler);
    gutterView.addEventListener("mouseleave", boundMouseLeaveHandler);
    gutterView.addEventListener("contextmenu", this._boundCreateContextMenuHandler);

    this._disposables.add(() => gutterView.removeEventListener("click", boundClickHandler), () => gutterView.removeEventListener("mousemove", boundMouseMoveHandler), () => gutterView.removeEventListener("mouseenter", boundMouseEnterHandler), () => gutterView.removeEventListener("mouseleave", boundMouseLeaveHandler), () => gutterView.removeEventListener("contextmenu", this._boundCreateContextMenuHandler), () => window.removeEventListener("mousemove", this._boundGlobalMouseMoveHandler));
  }

  _handleCreateContextMenu(event) {
    if (event.button !== 2 || !this._isDebugging()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const menuTemplate = atom.contextMenu.templateForEvent(event);
    const debuggerGroupIndex = menuTemplate.findIndex(item => item.label === "Debugger");
    const [debuggerGroup] = menuTemplate.splice(debuggerGroupIndex, 1);
    menuTemplate.unshift(...debuggerGroup.submenu, {
      type: "separator"
    });
    (0, _ContextMenu.showMenuForEvent)(event, menuTemplate);
  }

  dispose() {
    this._disposables.dispose();

    this._markers.forEach(marker => marker.destroy());

    if (this._gutter) {
      this._gutter.destroy();
    }
  }

  getEditor() {
    return this._editor;
  }

  _handleTextEditorDestroyed() {
    // Gutter.destroy seems to fail after text editor is destroyed, and
    // Gutter.onDidDestroy doesn't seem to be called in that case.
    this._gutter = null;

    this._delegate.handleTextEditorDestroyed(this);
  }

  _handleGutterDestroyed() {
    // If gutter is destroyed by some outside force, ensure the gutter is not
    // destroyed again.
    this._gutter = null;
  }

  _needsUpdate(line, bp) {
    // Checks if an existing marker no longer matches the properties of the breakpoint
    // it corresponds to.
    if (bp == null) {
      return true;
    }

    const info = this._markerInfo.get(line);

    if (info == null) {
      return true;
    }

    if (info.enabled !== bp.enabled || info.resolved !== bp.verified || info.conditional !== (bp.condition != null)) {
      return true;
    }

    return false;
  }

  _getLineForBp(bp) {
    // Zero-based breakpoints line map (to match UI markers).
    return bp.line - 1;
  }
  /**
   * Update the display with the current set of breakpoints for this editor.
   */


  _update() {
    const gutter = this._gutter;

    if (gutter == null) {
      return;
    }

    const debugging = this._isDebugging();

    const path = this._editor.getPath();

    if (path == null) {
      return;
    }

    const allBreakpoints = this._service.getModel().getBreakpoints();

    const breakpoints = allBreakpoints.filter(bp => bp.uri === path);
    const lineMap = new Map(breakpoints.map(bp => [this._getLineForBp(bp), bp])); // A mutable unhandled lines map.

    const unhandledLines = new Set(lineMap.keys());
    const markersToKeep = []; // Destroy markers that no longer correspond to breakpoints.

    this._markers.forEach(marker => {
      const line = marker.getStartBufferPosition().row;
      const bp = lineMap.get(line);

      if (debugging === this._debugging && unhandledLines.has(line) && !this._needsUpdate(line, bp)) {
        markersToKeep.push(marker);
        unhandledLines.delete(line);
      } else {
        this._markerInfo.delete(line);

        marker.destroy();
      }
    });

    this._debugging = debugging;

    const fileLength = this._editor.getLineCount(); // Add new markers for breakpoints without corresponding markers.


    for (const [line, breakpoint] of lineMap) {
      // Remove any breakpoints that are past the end of the file.
      if (line >= fileLength) {
        this._service.removeBreakpoints(breakpoint.getId());

        continue;
      }

      if (!unhandledLines.has(line)) {
        // This line has been handled.
        continue;
      }

      const marker = this._createBreakpointMarkerAtLine(line, false, // isShadow
      breakpoint); // Remember the properties of the marker at this line so it's easy to tell if it
      // needs to be updated when the breakpoint properties change.


      this._markerInfo.set(line, {
        enabled: breakpoint.enabled,
        resolved: breakpoint.verified,
        conditional: breakpoint.condition != null
      });

      marker.onDidChange(this._handleMarkerChange.bind(this, breakpoint));
      markersToKeep.push(marker);
    }

    gutter.show();
    this._markers = markersToKeep;
  }
  /**
   * Handler for marker movements due to text being edited.
   */


  _handleMarkerChange(breakpoint, event) {
    const path = this._editor.getPath();

    if (path == null || path.length === 0) {
      return;
    }

    if (!event.isValid) {
      this._service.removeBreakpoints(breakpoint.getId());
    } else if (event.oldHeadBufferPosition.row !== event.newHeadBufferPosition.row) {
      const newBp = {
        // VSP is 1-based line numbers.
        line: event.newHeadBufferPosition.row + 1,
        id: breakpoint.getId(),
        uri: breakpoint.uri,
        column: 0,
        enabled: breakpoint.enabled
      };

      if (breakpoint.condition != null) {
        newBp.condition = breakpoint.condition;
      }

      this._service.updateBreakpoints([newBp]);
    }
  }

  _handleGutterClick(event) {
    // classList isn't in the defs of EventTarget...
    const target = event.target;

    if (target.classList.contains("icon-right")) {
      return;
    }

    const path = this._editor.getPath(); // flowlint-next-line sketchy-null-string:off


    if (!path) {
      return;
    } // Don't toggle a breakpoint if the user clicked on something in the gutter that is not
    // the debugger, such as clicking on a line number to select the line.


    if (!target.classList.contains("debugger-shadow-breakpoint-icon") && !target.classList.contains("debugger-breakpoint-icon") && !target.classList.contains("debugger-breakpoint-icon-disabled") && !target.classList.contains("debugger-breakpoint-icon-unresolved") && !target.classList.contains("debugger-breakpoint-icon-conditional")) {
      return;
    }

    try {
      const curLine = this._getCurrentMouseEventLine(event);

      this._service.toggleSourceBreakpoint(path, curLine + 1);

      if (this._service.getModel().getBreakpointAtLine(path, curLine + 1) != null) {
        // If a breakpoint was added and showDebuggerOnBpSet config setting
        // is true, show the debugger.
        if (_featureConfig.default.get("atom-ide-debugger.showDebuggerOnBpSet")) {
          atom.commands.dispatch(atom.views.getView(atom.workspace), "debugger:show", {
            showOnlyIfHidden: true
          });
        }
      }
    } catch (e) {
      return;
    }
  }

  _getCurrentMouseEventLine(event) {
    // $FlowIssue
    const bufferPos = (0, _mouseToPosition.bufferPositionForMouseEvent)(event, this._editor);
    return bufferPos.row;
  }

  _handleGutterMouseMove(event) {
    try {
      const curLine = this._getCurrentMouseEventLine(event);

      if (this._isLineOverLastShadowBreakpoint(curLine)) {
        return;
      } // User moves to a new line we need to delete the old shadow breakpoint
      // and create a new one.


      this._removeLastShadowBreakpoint();

      this._createShadowBreakpointAtLine(this._editor, curLine);
    } catch (e) {
      return;
    }
  }

  _handleGutterMouseEnter(event) {
    window.addEventListener("mousemove", this._boundGlobalMouseMoveHandler);
  } // This is a giant hack to make sure that the breakpoint actually disappears.
  // The issue is that mouseleave event is sometimes not triggered on the gutter
  // I(vjeux) and matthewithanm spent multiple entire days trying to figure out
  // why without success, so this is going to have to do :(


  _handleGlobalMouseLeave(event) {
    if (!this._editor) {
      return;
    }

    const view = atom.views.getView(this._editor);
    const rect = view.getBoundingClientRect();

    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      this._removeLastShadowBreakpoint();

      window.removeEventListener("mousemove", this._boundGlobalMouseMoveHandler);
    }
  }

  _handleGutterMouseLeave(event) {
    this._removeLastShadowBreakpoint();
  }

  _isLineOverLastShadowBreakpoint(curLine) {
    const shadowBreakpointMarker = this._lastShadowBreakpointMarker;
    return shadowBreakpointMarker != null && shadowBreakpointMarker.getStartBufferPosition().row === curLine;
  }

  _removeLastShadowBreakpoint() {
    if (this._lastShadowBreakpointMarker != null) {
      this._lastShadowBreakpointMarker.destroy();

      this._lastShadowBreakpointMarker = null;
    }
  }

  _createShadowBreakpointAtLine(editor, line) {
    const breakpointsAtLine = this._markers.filter(marker => marker.getStartBufferPosition().row === line); // Don't create a shadow breakpoint at a line that already has a breakpoint.


    if (breakpointsAtLine.length === 0) {
      this._lastShadowBreakpointMarker = this._createBreakpointMarkerAtLine(line, true, // isShadow
      null);
    }
  }

  _createBreakpointMarkerAtLine(line, isShadow, breakpoint) {
    const enabled = breakpoint != null ? breakpoint.enabled : true;
    const resolved = breakpoint != null ? breakpoint.verified : false;
    const condition = breakpoint != null ? breakpoint.condition : null;

    const marker = this._editor.markBufferPosition([line, 0], {
      invalidate: "never"
    }); // If the debugger is not attached, display all breakpoints as resolved.
    // Once the debugger attaches, it will determine what's actually resolved or not.


    const unresolved = this._debugging && !resolved;
    const conditional = condition != null;
    const elem = document.createElement("span");
    elem.dataset.line = line.toString();

    if (breakpoint != null) {
      elem.dataset.bpId = breakpoint.getId();
    }

    elem.className = (0, _classnames.default)({
      "debugger-breakpoint-icon": !isShadow && enabled && !unresolved,
      "debugger-breakpoint-icon-conditional": conditional,
      "debugger-breakpoint-icon-nonconditional": !conditional,
      "debugger-shadow-breakpoint-icon": isShadow,
      "debugger-breakpoint-icon-disabled": !isShadow && !enabled,
      "debugger-breakpoint-icon-unresolved": !isShadow && enabled && unresolved
    });

    if (!isShadow) {
      if (!enabled) {
        elem.title = "Disabled breakpoint";
      } else if (unresolved) {
        elem.title = "Unresolved breakpoint";
      } else {
        elem.title = "Breakpoint";
      }

      if (conditional) {
        elem.title += ` (Condition: ${condition || ""})`;
      }
    }

    (0, _assert.default)(this._gutter != null);

    this._gutter.decorateMarker(marker, {
      item: elem
    });

    return marker;
  }

}

exports.default = BreakpointDisplayController;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyZWFrcG9pbnREaXNwbGF5Q29udHJvbGxlci5qcyJdLCJuYW1lcyI6WyJCcmVha3BvaW50RGlzcGxheUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImRlbGVnYXRlIiwic2VydmljZSIsImVkaXRvciIsIl9zZXJ2aWNlIiwiX2RlbGVnYXRlIiwiX2Rpc3Bvc2FibGVzIiwiX2VkaXRvciIsIl9ndXR0ZXIiLCJfbWFya2VycyIsIl9tYXJrZXJJbmZvIiwiX2xhc3RTaGFkb3dCcmVha3BvaW50TWFya2VyIiwiX2JvdW5kR2xvYmFsTW91c2VNb3ZlSGFuZGxlciIsIl9ib3VuZENyZWF0ZUNvbnRleHRNZW51SGFuZGxlciIsIl9kZWJ1Z2dpbmciLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwiTWFwIiwiX2hhbmRsZUdsb2JhbE1vdXNlTGVhdmUiLCJiaW5kIiwiX2hhbmRsZUNyZWF0ZUNvbnRleHRNZW51IiwiX2lzRGVidWdnaW5nIiwiZ3V0dGVyIiwiYWRkR3V0dGVyIiwibmFtZSIsInZpc2libGUiLCJwcmlvcml0eSIsImRlYnVnZ2VyTW9kZWwiLCJnZXRNb2RlbCIsImFkZFVudGlsRGVzdHJveWVkIiwib25EaWREZXN0cm95IiwiX2hhbmRsZUd1dHRlckRlc3Ryb3llZCIsIm9ic2VydmVHdXR0ZXJzIiwiX3JlZ2lzdGVyR3V0dGVyTW91c2VIYW5kbGVycyIsIk9ic2VydmFibGUiLCJtZXJnZSIsIm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMiLCJ2aWV3TW9kZWwiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJsZXQiLCJzdGFydFdpdGgiLCJzdWJzY3JpYmUiLCJfdXBkYXRlIiwiX2hhbmRsZVRleHRFZGl0b3JEZXN0cm95ZWQiLCJfcmVnaXN0ZXJFZGl0b3JDb250ZXh0TWVudUhhbmRsZXIiLCJnZXRQcm9jZXNzZXMiLCJzb21lIiwicHJvY2VzcyIsImRlYnVnZ2VyTW9kZSIsIkRlYnVnZ2VyTW9kZSIsIlNUT1BQRUQiLCJlZGl0b3JFbGVtZW50IiwiYXRvbSIsInZpZXdzIiwiZ2V0VmlldyIsImFkZEV2ZW50TGlzdGVuZXIiLCJyZW1vdmVFdmVudExpc3RlbmVyIiwiZ3V0dGVyVmlldyIsImJvdW5kQ2xpY2tIYW5kbGVyIiwiX2hhbmRsZUd1dHRlckNsaWNrIiwiYm91bmRNb3VzZU1vdmVIYW5kbGVyIiwiX2hhbmRsZUd1dHRlck1vdXNlTW92ZSIsImJvdW5kTW91c2VFbnRlckhhbmRsZXIiLCJfaGFuZGxlR3V0dGVyTW91c2VFbnRlciIsImJvdW5kTW91c2VMZWF2ZUhhbmRsZXIiLCJfaGFuZGxlR3V0dGVyTW91c2VMZWF2ZSIsImFkZCIsIndpbmRvdyIsImV2ZW50IiwiYnV0dG9uIiwicHJldmVudERlZmF1bHQiLCJzdG9wUHJvcGFnYXRpb24iLCJtZW51VGVtcGxhdGUiLCJjb250ZXh0TWVudSIsInRlbXBsYXRlRm9yRXZlbnQiLCJkZWJ1Z2dlckdyb3VwSW5kZXgiLCJmaW5kSW5kZXgiLCJpdGVtIiwibGFiZWwiLCJkZWJ1Z2dlckdyb3VwIiwic3BsaWNlIiwidW5zaGlmdCIsInN1Ym1lbnUiLCJ0eXBlIiwiZGlzcG9zZSIsImZvckVhY2giLCJtYXJrZXIiLCJkZXN0cm95IiwiZ2V0RWRpdG9yIiwiaGFuZGxlVGV4dEVkaXRvckRlc3Ryb3llZCIsIl9uZWVkc1VwZGF0ZSIsImxpbmUiLCJicCIsImluZm8iLCJnZXQiLCJlbmFibGVkIiwicmVzb2x2ZWQiLCJ2ZXJpZmllZCIsImNvbmRpdGlvbmFsIiwiY29uZGl0aW9uIiwiX2dldExpbmVGb3JCcCIsImRlYnVnZ2luZyIsInBhdGgiLCJnZXRQYXRoIiwiYWxsQnJlYWtwb2ludHMiLCJnZXRCcmVha3BvaW50cyIsImJyZWFrcG9pbnRzIiwiZmlsdGVyIiwidXJpIiwibGluZU1hcCIsIm1hcCIsInVuaGFuZGxlZExpbmVzIiwiU2V0Iiwia2V5cyIsIm1hcmtlcnNUb0tlZXAiLCJnZXRTdGFydEJ1ZmZlclBvc2l0aW9uIiwicm93IiwiaGFzIiwicHVzaCIsImRlbGV0ZSIsImZpbGVMZW5ndGgiLCJnZXRMaW5lQ291bnQiLCJicmVha3BvaW50IiwicmVtb3ZlQnJlYWtwb2ludHMiLCJnZXRJZCIsIl9jcmVhdGVCcmVha3BvaW50TWFya2VyQXRMaW5lIiwic2V0Iiwib25EaWRDaGFuZ2UiLCJfaGFuZGxlTWFya2VyQ2hhbmdlIiwic2hvdyIsImxlbmd0aCIsImlzVmFsaWQiLCJvbGRIZWFkQnVmZmVyUG9zaXRpb24iLCJuZXdIZWFkQnVmZmVyUG9zaXRpb24iLCJuZXdCcCIsImlkIiwiY29sdW1uIiwidXBkYXRlQnJlYWtwb2ludHMiLCJ0YXJnZXQiLCJjbGFzc0xpc3QiLCJjb250YWlucyIsImN1ckxpbmUiLCJfZ2V0Q3VycmVudE1vdXNlRXZlbnRMaW5lIiwidG9nZ2xlU291cmNlQnJlYWtwb2ludCIsImdldEJyZWFrcG9pbnRBdExpbmUiLCJmZWF0dXJlQ29uZmlnIiwiY29tbWFuZHMiLCJkaXNwYXRjaCIsIndvcmtzcGFjZSIsInNob3dPbmx5SWZIaWRkZW4iLCJlIiwiYnVmZmVyUG9zIiwiX2lzTGluZU92ZXJMYXN0U2hhZG93QnJlYWtwb2ludCIsIl9yZW1vdmVMYXN0U2hhZG93QnJlYWtwb2ludCIsIl9jcmVhdGVTaGFkb3dCcmVha3BvaW50QXRMaW5lIiwidmlldyIsInJlY3QiLCJnZXRCb3VuZGluZ0NsaWVudFJlY3QiLCJjbGllbnRYIiwibGVmdCIsInJpZ2h0IiwiY2xpZW50WSIsInRvcCIsImJvdHRvbSIsInNoYWRvd0JyZWFrcG9pbnRNYXJrZXIiLCJicmVha3BvaW50c0F0TGluZSIsImlzU2hhZG93IiwibWFya0J1ZmZlclBvc2l0aW9uIiwiaW52YWxpZGF0ZSIsInVucmVzb2x2ZWQiLCJlbGVtIiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwiZGF0YXNldCIsInRvU3RyaW5nIiwiYnBJZCIsImNsYXNzTmFtZSIsInRpdGxlIiwiZGVjb3JhdGVNYXJrZXIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFD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QUFDTyxLQUFMLElBQWUsZ0JBQWU5RSxTQUFTLElBQUksRUFBRyxHQUE5QztBQUNEO0FBQ0Y7O0FBRUQseUJBQVUsS0FBSzFGLE9BQUwsSUFBZ0IsSUFBMUI7O0FBQ0EsU0FBS0EsT0FBTCxDQUFheUssY0FBYixDQUE0QjVGLE1BQTVCLEVBQW9DO0FBQUVULE1BQUFBLElBQUksRUFBRTZGO0FBQVIsS0FBcEM7O0FBQ0EsV0FBT3BGLE1BQVA7QUFDRDs7QUFuYThDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBJQnJlYWtwb2ludCwgSURlYnVnU2VydmljZSwgSVVJQnJlYWtwb2ludCB9IGZyb20gXCIuL3R5cGVzXCJcblxuaW1wb3J0IGludmFyaWFudCBmcm9tIFwiYXNzZXJ0XCJcbmltcG9ydCB7IGJ1ZmZlclBvc2l0aW9uRm9yTW91c2VFdmVudCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy1hdG9tL21vdXNlLXRvLXBvc2l0aW9uXCJcbmltcG9ydCB7IG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXZlbnRcIlxuaW1wb3J0IHsgZmFzdERlYm91bmNlIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL29ic2VydmFibGVcIlxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxuaW1wb3J0IHsgc2hvd01lbnVGb3JFdmVudCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy1hdG9tL0NvbnRleHRNZW51XCJcbmltcG9ydCBjbGFzc25hbWVzIGZyb20gXCJjbGFzc25hbWVzXCJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqcy1jb21wYXQvYnVuZGxlcy9yeGpzLWNvbXBhdC51bWQubWluLmpzXCJcbmltcG9ydCB7IERlYnVnZ2VyTW9kZSB9IGZyb20gXCIuL2NvbnN0YW50c1wiXG5pbXBvcnQgZmVhdHVyZUNvbmZpZyBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtYXRvbS9mZWF0dXJlLWNvbmZpZ1wiXG5cbi8qKlxuICogQSBzaW5nbGUgZGVsZWdhdGUgd2hpY2ggaGFuZGxlcyBldmVudHMgZnJvbSB0aGUgb2JqZWN0LlxuICpcbiAqIFRoaXMgaXMgc2ltcGxlciB0aGFuIHJlZ2lzdGVyaW5nIGhhbmRsZXJzIHVzaW5nIGVtaXR0ZXIgZXZlbnRzIGRpcmVjdGx5LCBhc1xuICogdGhlcmUncyBsZXNzIG1lc3N5IGJvb2trZWVwaW5nIHJlZ2FyZGluZyBsaWZldGltZXMgb2YgdGhlIHVucmVnaXN0ZXJcbiAqIERpc3Bvc2FibGUgb2JqZWN0cy5cbiAqL1xudHlwZSBCcmVha3BvaW50RGlzcGxheUNvbnRyb2xsZXJEZWxlZ2F0ZSA9IHtcbiAgK2hhbmRsZVRleHRFZGl0b3JEZXN0cm95ZWQ6IChjb250cm9sbGVyOiBCcmVha3BvaW50RGlzcGxheUNvbnRyb2xsZXIpID0+IHZvaWQsXG59XG5cbnR5cGUgQnJlYWtwb2ludE1hcmtlclByb3BlcnRpZXMgPSB7XG4gIGVuYWJsZWQ6IGJvb2xlYW4sXG4gIHJlc29sdmVkOiBib29sZWFuLFxuICBjb25kaXRpb25hbDogYm9vbGVhbixcbn1cblxuLyoqXG4gKiBIYW5kbGVzIGRpc3BsYXlpbmcgYnJlYWtwb2ludHMgYW5kIHByb2Nlc3NpbmcgZXZlbnRzIGZvciBhIHNpbmdsZSB0ZXh0XG4gKiBlZGl0b3IuXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEJyZWFrcG9pbnREaXNwbGF5Q29udHJvbGxlciB7XG4gIF9zZXJ2aWNlOiBJRGVidWdTZXJ2aWNlXG4gIF9kZWxlZ2F0ZTogQnJlYWtwb2ludERpc3BsYXlDb250cm9sbGVyRGVsZWdhdGVcbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXG4gIF9lZGl0b3I6IGF0b20kVGV4dEVkaXRvclxuICBfZ3V0dGVyOiA/YXRvbSRHdXR0ZXJcbiAgX21hcmtlcnM6IEFycmF5PGF0b20kTWFya2VyPlxuICBfbWFya2VySW5mbzogTWFwPG51bWJlciwgQnJlYWtwb2ludE1hcmtlclByb3BlcnRpZXM+XG4gIF9sYXN0U2hhZG93QnJlYWtwb2ludE1hcmtlcjogP2F0b20kTWFya2VyXG4gIF9ib3VuZEdsb2JhbE1vdXNlTW92ZUhhbmRsZXI6IChldmVudDogTW91c2VFdmVudCkgPT4gdm9pZFxuICBfYm91bmRDcmVhdGVDb250ZXh0TWVudUhhbmRsZXI6IChldmVudDogTW91c2VFdmVudCkgPT4gdm9pZFxuICBfZGVidWdnaW5nOiBib29sZWFuXG5cbiAgY29uc3RydWN0b3IoZGVsZWdhdGU6IEJyZWFrcG9pbnREaXNwbGF5Q29udHJvbGxlckRlbGVnYXRlLCBzZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLCBlZGl0b3I6IGF0b20kVGV4dEVkaXRvcikge1xuICAgIHRoaXMuX2RlbGVnYXRlID0gZGVsZWdhdGVcbiAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcbiAgICB0aGlzLl9zZXJ2aWNlID0gc2VydmljZVxuICAgIHRoaXMuX2VkaXRvciA9IGVkaXRvclxuICAgIHRoaXMuX21hcmtlcnMgPSBbXVxuICAgIHRoaXMuX21hcmtlckluZm8gPSBuZXcgTWFwKClcbiAgICB0aGlzLl9sYXN0U2hhZG93QnJlYWtwb2ludE1hcmtlciA9IG51bGxcbiAgICB0aGlzLl9ib3VuZEdsb2JhbE1vdXNlTW92ZUhhbmRsZXIgPSB0aGlzLl9oYW5kbGVHbG9iYWxNb3VzZUxlYXZlLmJpbmQodGhpcylcbiAgICB0aGlzLl9ib3VuZENyZWF0ZUNvbnRleHRNZW51SGFuZGxlciA9IHRoaXMuX2hhbmRsZUNyZWF0ZUNvbnRleHRNZW51LmJpbmQodGhpcylcbiAgICB0aGlzLl9kZWJ1Z2dpbmcgPSB0aGlzLl9pc0RlYnVnZ2luZygpXG5cbiAgICAvLyBDb25maWd1cmUgdGhlIGd1dHRlci5cbiAgICBjb25zdCBndXR0ZXIgPSBlZGl0b3IuYWRkR3V0dGVyKHtcbiAgICAgIG5hbWU6IFwiZGVidWdnZXItYnJlYWtwb2ludFwiLFxuICAgICAgdmlzaWJsZTogZmFsc2UsXG4gICAgICAvLyBQcmlvcml0eSBpcyAtMjAwIGJ5IGRlZmF1bHQgYW5kIDAgaXMgdGhlIGxpbmUgbnVtYmVyXG4gICAgICBwcmlvcml0eTogLTExMDAsXG4gICAgfSlcbiAgICBjb25zdCBkZWJ1Z2dlck1vZGVsID0gdGhpcy5fc2VydmljZS5nZXRNb2RlbCgpXG4gICAgdGhpcy5fZ3V0dGVyID0gZ3V0dGVyXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkVW50aWxEZXN0cm95ZWQoXG4gICAgICBlZGl0b3IsXG4gICAgICBndXR0ZXIub25EaWREZXN0cm95KHRoaXMuX2hhbmRsZUd1dHRlckRlc3Ryb3llZC5iaW5kKHRoaXMpKSxcbiAgICAgIGVkaXRvci5vYnNlcnZlR3V0dGVycyh0aGlzLl9yZWdpc3Rlckd1dHRlck1vdXNlSGFuZGxlcnMuYmluZCh0aGlzKSksXG4gICAgICBPYnNlcnZhYmxlLm1lcmdlKFxuICAgICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKGRlYnVnZ2VyTW9kZWwub25EaWRDaGFuZ2VCcmVha3BvaW50cy5iaW5kKGRlYnVnZ2VyTW9kZWwpKSxcbiAgICAgICAgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbih0aGlzLl9zZXJ2aWNlLnZpZXdNb2RlbC5vbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMuYmluZCh0aGlzLl9zZXJ2aWNlLnZpZXdNb2RlbCkpXG4gICAgICApXG4gICAgICAgIC8vIERlYm91bmNlIHRvIGFjY291bnQgZm9yIGJ1bGsgdXBkYXRlcyBhbmQgbm90IGJsb2NrIHRoZSBVSVxuICAgICAgICAubGV0KGZhc3REZWJvdW5jZSgxMCkpXG4gICAgICAgIC5zdGFydFdpdGgobnVsbClcbiAgICAgICAgLnN1YnNjcmliZSh0aGlzLl91cGRhdGUuYmluZCh0aGlzKSksXG4gICAgICB0aGlzLl9lZGl0b3Iub25EaWREZXN0cm95KHRoaXMuX2hhbmRsZVRleHRFZGl0b3JEZXN0cm95ZWQuYmluZCh0aGlzKSksXG4gICAgICB0aGlzLl9yZWdpc3RlckVkaXRvckNvbnRleHRNZW51SGFuZGxlcigpXG4gICAgKVxuICB9XG5cbiAgX2lzRGVidWdnaW5nKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLl9zZXJ2aWNlXG4gICAgICAuZ2V0TW9kZWwoKVxuICAgICAgLmdldFByb2Nlc3NlcygpXG4gICAgICAuc29tZSgocHJvY2VzcykgPT4gcHJvY2Vzcy5kZWJ1Z2dlck1vZGUgIT09IERlYnVnZ2VyTW9kZS5TVE9QUEVEKVxuICB9XG5cbiAgX3JlZ2lzdGVyRWRpdG9yQ29udGV4dE1lbnVIYW5kbGVyKCk6IElEaXNwb3NhYmxlIHtcbiAgICBjb25zdCBlZGl0b3JFbGVtZW50ID0gYXRvbS52aWV3cy5nZXRWaWV3KHRoaXMuX2VkaXRvcilcbiAgICBlZGl0b3JFbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjb250ZXh0bWVudVwiLCB0aGlzLl9ib3VuZENyZWF0ZUNvbnRleHRNZW51SGFuZGxlcilcbiAgICByZXR1cm4gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKCkgPT5cbiAgICAgIGVkaXRvckVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNvbnRleHRtZW51XCIsIHRoaXMuX2JvdW5kQ3JlYXRlQ29udGV4dE1lbnVIYW5kbGVyKVxuICAgIClcbiAgfVxuXG4gIF9yZWdpc3Rlckd1dHRlck1vdXNlSGFuZGxlcnMoZ3V0dGVyOiBhdG9tJEd1dHRlcik6IHZvaWQge1xuICAgIGNvbnN0IGd1dHRlclZpZXcgPSBhdG9tLnZpZXdzLmdldFZpZXcoZ3V0dGVyKVxuICAgIGlmIChndXR0ZXIubmFtZSAhPT0gXCJsaW5lLW51bWJlclwiICYmIGd1dHRlci5uYW1lICE9PSBcImRlYnVnZ2VyLWJyZWFrcG9pbnRcIikge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IGJvdW5kQ2xpY2tIYW5kbGVyID0gdGhpcy5faGFuZGxlR3V0dGVyQ2xpY2suYmluZCh0aGlzKVxuICAgIGNvbnN0IGJvdW5kTW91c2VNb3ZlSGFuZGxlciA9IHRoaXMuX2hhbmRsZUd1dHRlck1vdXNlTW92ZS5iaW5kKHRoaXMpXG4gICAgY29uc3QgYm91bmRNb3VzZUVudGVySGFuZGxlciA9IHRoaXMuX2hhbmRsZUd1dHRlck1vdXNlRW50ZXIuYmluZCh0aGlzKVxuICAgIGNvbnN0IGJvdW5kTW91c2VMZWF2ZUhhbmRsZXIgPSB0aGlzLl9oYW5kbGVHdXR0ZXJNb3VzZUxlYXZlLmJpbmQodGhpcylcbiAgICAvLyBBZGQgbW91c2UgbGlzdGVuZXJzIGd1dHRlciBmb3Igc2V0dGluZyBicmVha3BvaW50cy5cbiAgICBndXR0ZXJWaWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBib3VuZENsaWNrSGFuZGxlcilcbiAgICBndXR0ZXJWaWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgYm91bmRNb3VzZU1vdmVIYW5kbGVyKVxuICAgIGd1dHRlclZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZW50ZXJcIiwgYm91bmRNb3VzZUVudGVySGFuZGxlcilcbiAgICBndXR0ZXJWaWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsIGJvdW5kTW91c2VMZWF2ZUhhbmRsZXIpXG4gICAgZ3V0dGVyVmlldy5hZGRFdmVudExpc3RlbmVyKFwiY29udGV4dG1lbnVcIiwgdGhpcy5fYm91bmRDcmVhdGVDb250ZXh0TWVudUhhbmRsZXIpXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgKCkgPT4gZ3V0dGVyVmlldy5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYm91bmRDbGlja0hhbmRsZXIpLFxuICAgICAgKCkgPT4gZ3V0dGVyVmlldy5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIGJvdW5kTW91c2VNb3ZlSGFuZGxlciksXG4gICAgICAoKSA9PiBndXR0ZXJWaWV3LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZWVudGVyXCIsIGJvdW5kTW91c2VFbnRlckhhbmRsZXIpLFxuICAgICAgKCkgPT4gZ3V0dGVyVmlldy5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2VsZWF2ZVwiLCBib3VuZE1vdXNlTGVhdmVIYW5kbGVyKSxcbiAgICAgICgpID0+IGd1dHRlclZpZXcucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNvbnRleHRtZW51XCIsIHRoaXMuX2JvdW5kQ3JlYXRlQ29udGV4dE1lbnVIYW5kbGVyKSxcbiAgICAgICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIHRoaXMuX2JvdW5kR2xvYmFsTW91c2VNb3ZlSGFuZGxlcilcbiAgICApXG4gIH1cblxuICBfaGFuZGxlQ3JlYXRlQ29udGV4dE1lbnUoZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoZXZlbnQuYnV0dG9uICE9PSAyIHx8ICF0aGlzLl9pc0RlYnVnZ2luZygpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKClcblxuICAgIGNvbnN0IG1lbnVUZW1wbGF0ZSA9IGF0b20uY29udGV4dE1lbnUudGVtcGxhdGVGb3JFdmVudChldmVudClcbiAgICBjb25zdCBkZWJ1Z2dlckdyb3VwSW5kZXggPSBtZW51VGVtcGxhdGUuZmluZEluZGV4KChpdGVtKSA9PiBpdGVtLmxhYmVsID09PSBcIkRlYnVnZ2VyXCIpXG4gICAgY29uc3QgW2RlYnVnZ2VyR3JvdXBdID0gbWVudVRlbXBsYXRlLnNwbGljZShkZWJ1Z2dlckdyb3VwSW5kZXgsIDEpXG4gICAgbWVudVRlbXBsYXRlLnVuc2hpZnQoLi4uZGVidWdnZXJHcm91cC5zdWJtZW51LCB7IHR5cGU6IFwic2VwYXJhdG9yXCIgfSlcbiAgICBzaG93TWVudUZvckV2ZW50KGV2ZW50LCBtZW51VGVtcGxhdGUpXG4gIH1cblxuICBkaXNwb3NlKCkge1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgIHRoaXMuX21hcmtlcnMuZm9yRWFjaCgobWFya2VyKSA9PiBtYXJrZXIuZGVzdHJveSgpKVxuICAgIGlmICh0aGlzLl9ndXR0ZXIpIHtcbiAgICAgIHRoaXMuX2d1dHRlci5kZXN0cm95KClcbiAgICB9XG4gIH1cblxuICBnZXRFZGl0b3IoKTogYXRvbSRUZXh0RWRpdG9yIHtcbiAgICByZXR1cm4gdGhpcy5fZWRpdG9yXG4gIH1cblxuICBfaGFuZGxlVGV4dEVkaXRvckRlc3Ryb3llZCgpIHtcbiAgICAvLyBHdXR0ZXIuZGVzdHJveSBzZWVtcyB0byBmYWlsIGFmdGVyIHRleHQgZWRpdG9yIGlzIGRlc3Ryb3llZCwgYW5kXG4gICAgLy8gR3V0dGVyLm9uRGlkRGVzdHJveSBkb2Vzbid0IHNlZW0gdG8gYmUgY2FsbGVkIGluIHRoYXQgY2FzZS5cbiAgICB0aGlzLl9ndXR0ZXIgPSBudWxsXG4gICAgdGhpcy5fZGVsZWdhdGUuaGFuZGxlVGV4dEVkaXRvckRlc3Ryb3llZCh0aGlzKVxuICB9XG5cbiAgX2hhbmRsZUd1dHRlckRlc3Ryb3llZCgpIHtcbiAgICAvLyBJZiBndXR0ZXIgaXMgZGVzdHJveWVkIGJ5IHNvbWUgb3V0c2lkZSBmb3JjZSwgZW5zdXJlIHRoZSBndXR0ZXIgaXMgbm90XG4gICAgLy8gZGVzdHJveWVkIGFnYWluLlxuICAgIHRoaXMuX2d1dHRlciA9IG51bGxcbiAgfVxuXG4gIF9uZWVkc1VwZGF0ZShsaW5lOiBudW1iZXIsIGJwOiA/SUJyZWFrcG9pbnQpOiBib29sZWFuIHtcbiAgICAvLyBDaGVja3MgaWYgYW4gZXhpc3RpbmcgbWFya2VyIG5vIGxvbmdlciBtYXRjaGVzIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBicmVha3BvaW50XG4gICAgLy8gaXQgY29ycmVzcG9uZHMgdG8uXG4gICAgaWYgKGJwID09IG51bGwpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgY29uc3QgaW5mbyA9IHRoaXMuX21hcmtlckluZm8uZ2V0KGxpbmUpXG4gICAgaWYgKGluZm8gPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBpZiAoaW5mby5lbmFibGVkICE9PSBicC5lbmFibGVkIHx8IGluZm8ucmVzb2x2ZWQgIT09IGJwLnZlcmlmaWVkIHx8IGluZm8uY29uZGl0aW9uYWwgIT09IChicC5jb25kaXRpb24gIT0gbnVsbCkpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBfZ2V0TGluZUZvckJwKGJwOiBJQnJlYWtwb2ludCk6IG51bWJlciB7XG4gICAgLy8gWmVyby1iYXNlZCBicmVha3BvaW50cyBsaW5lIG1hcCAodG8gbWF0Y2ggVUkgbWFya2VycykuXG4gICAgcmV0dXJuIGJwLmxpbmUgLSAxXG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIHRoZSBkaXNwbGF5IHdpdGggdGhlIGN1cnJlbnQgc2V0IG9mIGJyZWFrcG9pbnRzIGZvciB0aGlzIGVkaXRvci5cbiAgICovXG4gIF91cGRhdGUoKTogdm9pZCB7XG4gICAgY29uc3QgZ3V0dGVyID0gdGhpcy5fZ3V0dGVyXG4gICAgaWYgKGd1dHRlciA9PSBudWxsKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBkZWJ1Z2dpbmcgPSB0aGlzLl9pc0RlYnVnZ2luZygpXG5cbiAgICBjb25zdCBwYXRoID0gdGhpcy5fZWRpdG9yLmdldFBhdGgoKVxuICAgIGlmIChwYXRoID09IG51bGwpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCBhbGxCcmVha3BvaW50cyA9IHRoaXMuX3NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cygpXG4gICAgY29uc3QgYnJlYWtwb2ludHMgPSBhbGxCcmVha3BvaW50cy5maWx0ZXIoKGJwKSA9PiBicC51cmkgPT09IHBhdGgpXG4gICAgY29uc3QgbGluZU1hcCA9IG5ldyBNYXAoYnJlYWtwb2ludHMubWFwKChicCkgPT4gW3RoaXMuX2dldExpbmVGb3JCcChicCksIGJwXSkpXG5cbiAgICAvLyBBIG11dGFibGUgdW5oYW5kbGVkIGxpbmVzIG1hcC5cbiAgICBjb25zdCB1bmhhbmRsZWRMaW5lcyA9IG5ldyBTZXQobGluZU1hcC5rZXlzKCkpXG4gICAgY29uc3QgbWFya2Vyc1RvS2VlcCA9IFtdXG5cbiAgICAvLyBEZXN0cm95IG1hcmtlcnMgdGhhdCBubyBsb25nZXIgY29ycmVzcG9uZCB0byBicmVha3BvaW50cy5cbiAgICB0aGlzLl9tYXJrZXJzLmZvckVhY2goKG1hcmtlcikgPT4ge1xuICAgICAgY29uc3QgbGluZSA9IG1hcmtlci5nZXRTdGFydEJ1ZmZlclBvc2l0aW9uKCkucm93XG4gICAgICBjb25zdCBicCA9IGxpbmVNYXAuZ2V0KGxpbmUpXG4gICAgICBpZiAoZGVidWdnaW5nID09PSB0aGlzLl9kZWJ1Z2dpbmcgJiYgdW5oYW5kbGVkTGluZXMuaGFzKGxpbmUpICYmICF0aGlzLl9uZWVkc1VwZGF0ZShsaW5lLCBicCkpIHtcbiAgICAgICAgbWFya2Vyc1RvS2VlcC5wdXNoKG1hcmtlcilcbiAgICAgICAgdW5oYW5kbGVkTGluZXMuZGVsZXRlKGxpbmUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9tYXJrZXJJbmZvLmRlbGV0ZShsaW5lKVxuICAgICAgICBtYXJrZXIuZGVzdHJveSgpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHRoaXMuX2RlYnVnZ2luZyA9IGRlYnVnZ2luZ1xuXG4gICAgY29uc3QgZmlsZUxlbmd0aCA9IHRoaXMuX2VkaXRvci5nZXRMaW5lQ291bnQoKVxuXG4gICAgLy8gQWRkIG5ldyBtYXJrZXJzIGZvciBicmVha3BvaW50cyB3aXRob3V0IGNvcnJlc3BvbmRpbmcgbWFya2Vycy5cbiAgICBmb3IgKGNvbnN0IFtsaW5lLCBicmVha3BvaW50XSBvZiBsaW5lTWFwKSB7XG4gICAgICAvLyBSZW1vdmUgYW55IGJyZWFrcG9pbnRzIHRoYXQgYXJlIHBhc3QgdGhlIGVuZCBvZiB0aGUgZmlsZS5cbiAgICAgIGlmIChsaW5lID49IGZpbGVMZW5ndGgpIHtcbiAgICAgICAgdGhpcy5fc2VydmljZS5yZW1vdmVCcmVha3BvaW50cyhicmVha3BvaW50LmdldElkKCkpXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG5cbiAgICAgIGlmICghdW5oYW5kbGVkTGluZXMuaGFzKGxpbmUpKSB7XG4gICAgICAgIC8vIFRoaXMgbGluZSBoYXMgYmVlbiBoYW5kbGVkLlxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgY29uc3QgbWFya2VyID0gdGhpcy5fY3JlYXRlQnJlYWtwb2ludE1hcmtlckF0TGluZShcbiAgICAgICAgbGluZSxcbiAgICAgICAgZmFsc2UsIC8vIGlzU2hhZG93XG4gICAgICAgIGJyZWFrcG9pbnRcbiAgICAgIClcblxuICAgICAgLy8gUmVtZW1iZXIgdGhlIHByb3BlcnRpZXMgb2YgdGhlIG1hcmtlciBhdCB0aGlzIGxpbmUgc28gaXQncyBlYXN5IHRvIHRlbGwgaWYgaXRcbiAgICAgIC8vIG5lZWRzIHRvIGJlIHVwZGF0ZWQgd2hlbiB0aGUgYnJlYWtwb2ludCBwcm9wZXJ0aWVzIGNoYW5nZS5cbiAgICAgIHRoaXMuX21hcmtlckluZm8uc2V0KGxpbmUsIHtcbiAgICAgICAgZW5hYmxlZDogYnJlYWtwb2ludC5lbmFibGVkLFxuICAgICAgICByZXNvbHZlZDogYnJlYWtwb2ludC52ZXJpZmllZCxcbiAgICAgICAgY29uZGl0aW9uYWw6IGJyZWFrcG9pbnQuY29uZGl0aW9uICE9IG51bGwsXG4gICAgICB9KVxuICAgICAgbWFya2VyLm9uRGlkQ2hhbmdlKHRoaXMuX2hhbmRsZU1hcmtlckNoYW5nZS5iaW5kKHRoaXMsIGJyZWFrcG9pbnQpKVxuICAgICAgbWFya2Vyc1RvS2VlcC5wdXNoKG1hcmtlcilcbiAgICB9XG5cbiAgICBndXR0ZXIuc2hvdygpXG4gICAgdGhpcy5fbWFya2VycyA9IG1hcmtlcnNUb0tlZXBcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGVyIGZvciBtYXJrZXIgbW92ZW1lbnRzIGR1ZSB0byB0ZXh0IGJlaW5nIGVkaXRlZC5cbiAgICovXG4gIF9oYW5kbGVNYXJrZXJDaGFuZ2UoYnJlYWtwb2ludDogSUJyZWFrcG9pbnQsIGV2ZW50OiBhdG9tJE1hcmtlckNoYW5nZUV2ZW50KTogdm9pZCB7XG4gICAgY29uc3QgcGF0aCA9IHRoaXMuX2VkaXRvci5nZXRQYXRoKClcbiAgICBpZiAocGF0aCA9PSBudWxsIHx8IHBhdGgubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKCFldmVudC5pc1ZhbGlkKSB7XG4gICAgICB0aGlzLl9zZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKGJyZWFrcG9pbnQuZ2V0SWQoKSlcbiAgICB9IGVsc2UgaWYgKGV2ZW50Lm9sZEhlYWRCdWZmZXJQb3NpdGlvbi5yb3cgIT09IGV2ZW50Lm5ld0hlYWRCdWZmZXJQb3NpdGlvbi5yb3cpIHtcbiAgICAgIGNvbnN0IG5ld0JwOiBJVUlCcmVha3BvaW50ID0ge1xuICAgICAgICAvLyBWU1AgaXMgMS1iYXNlZCBsaW5lIG51bWJlcnMuXG4gICAgICAgIGxpbmU6IGV2ZW50Lm5ld0hlYWRCdWZmZXJQb3NpdGlvbi5yb3cgKyAxLFxuICAgICAgICBpZDogYnJlYWtwb2ludC5nZXRJZCgpLFxuICAgICAgICB1cmk6IGJyZWFrcG9pbnQudXJpLFxuICAgICAgICBjb2x1bW46IDAsXG4gICAgICAgIGVuYWJsZWQ6IGJyZWFrcG9pbnQuZW5hYmxlZCxcbiAgICAgIH1cblxuICAgICAgaWYgKGJyZWFrcG9pbnQuY29uZGl0aW9uICE9IG51bGwpIHtcbiAgICAgICAgbmV3QnAuY29uZGl0aW9uID0gYnJlYWtwb2ludC5jb25kaXRpb25cbiAgICAgIH1cblxuICAgICAgdGhpcy5fc2VydmljZS51cGRhdGVCcmVha3BvaW50cyhbbmV3QnBdKVxuICAgIH1cbiAgfVxuXG4gIF9oYW5kbGVHdXR0ZXJDbGljayhldmVudDogRXZlbnQpOiB2b2lkIHtcbiAgICAvLyBjbGFzc0xpc3QgaXNuJ3QgaW4gdGhlIGRlZnMgb2YgRXZlbnRUYXJnZXQuLi5cbiAgICBjb25zdCB0YXJnZXQ6IEhUTUxFbGVtZW50ID0gKGV2ZW50LnRhcmdldDogYW55KVxuICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaWNvbi1yaWdodFwiKSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgcGF0aCA9IHRoaXMuX2VkaXRvci5nZXRQYXRoKClcbiAgICAvLyBmbG93bGludC1uZXh0LWxpbmUgc2tldGNoeS1udWxsLXN0cmluZzpvZmZcbiAgICBpZiAoIXBhdGgpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIERvbid0IHRvZ2dsZSBhIGJyZWFrcG9pbnQgaWYgdGhlIHVzZXIgY2xpY2tlZCBvbiBzb21ldGhpbmcgaW4gdGhlIGd1dHRlciB0aGF0IGlzIG5vdFxuICAgIC8vIHRoZSBkZWJ1Z2dlciwgc3VjaCBhcyBjbGlja2luZyBvbiBhIGxpbmUgbnVtYmVyIHRvIHNlbGVjdCB0aGUgbGluZS5cbiAgICBpZiAoXG4gICAgICAhdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucyhcImRlYnVnZ2VyLXNoYWRvdy1icmVha3BvaW50LWljb25cIikgJiZcbiAgICAgICF0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKFwiZGVidWdnZXItYnJlYWtwb2ludC1pY29uXCIpICYmXG4gICAgICAhdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucyhcImRlYnVnZ2VyLWJyZWFrcG9pbnQtaWNvbi1kaXNhYmxlZFwiKSAmJlxuICAgICAgIXRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoXCJkZWJ1Z2dlci1icmVha3BvaW50LWljb24tdW5yZXNvbHZlZFwiKSAmJlxuICAgICAgIXRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoXCJkZWJ1Z2dlci1icmVha3BvaW50LWljb24tY29uZGl0aW9uYWxcIilcbiAgICApIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBjdXJMaW5lID0gdGhpcy5fZ2V0Q3VycmVudE1vdXNlRXZlbnRMaW5lKGV2ZW50KVxuICAgICAgdGhpcy5fc2VydmljZS50b2dnbGVTb3VyY2VCcmVha3BvaW50KHBhdGgsIGN1ckxpbmUgKyAxKVxuXG4gICAgICBpZiAodGhpcy5fc2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRBdExpbmUocGF0aCwgY3VyTGluZSArIDEpICE9IG51bGwpIHtcbiAgICAgICAgLy8gSWYgYSBicmVha3BvaW50IHdhcyBhZGRlZCBhbmQgc2hvd0RlYnVnZ2VyT25CcFNldCBjb25maWcgc2V0dGluZ1xuICAgICAgICAvLyBpcyB0cnVlLCBzaG93IHRoZSBkZWJ1Z2dlci5cbiAgICAgICAgaWYgKGZlYXR1cmVDb25maWcuZ2V0KFwiYXRvbS1pZGUtZGVidWdnZXIuc2hvd0RlYnVnZ2VyT25CcFNldFwiKSkge1xuICAgICAgICAgIGF0b20uY29tbWFuZHMuZGlzcGF0Y2goYXRvbS52aWV3cy5nZXRWaWV3KGF0b20ud29ya3NwYWNlKSwgXCJkZWJ1Z2dlcjpzaG93XCIsIHtcbiAgICAgICAgICAgIHNob3dPbmx5SWZIaWRkZW46IHRydWUsXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgfVxuXG4gIF9nZXRDdXJyZW50TW91c2VFdmVudExpbmUoZXZlbnQ6IEV2ZW50KTogbnVtYmVyIHtcbiAgICAvLyAkRmxvd0lzc3VlXG4gICAgY29uc3QgYnVmZmVyUG9zID0gYnVmZmVyUG9zaXRpb25Gb3JNb3VzZUV2ZW50KGV2ZW50LCB0aGlzLl9lZGl0b3IpXG4gICAgcmV0dXJuIGJ1ZmZlclBvcy5yb3dcbiAgfVxuXG4gIF9oYW5kbGVHdXR0ZXJNb3VzZU1vdmUoZXZlbnQ6IEV2ZW50KTogdm9pZCB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGN1ckxpbmUgPSB0aGlzLl9nZXRDdXJyZW50TW91c2VFdmVudExpbmUoZXZlbnQpXG4gICAgICBpZiAodGhpcy5faXNMaW5lT3Zlckxhc3RTaGFkb3dCcmVha3BvaW50KGN1ckxpbmUpKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgLy8gVXNlciBtb3ZlcyB0byBhIG5ldyBsaW5lIHdlIG5lZWQgdG8gZGVsZXRlIHRoZSBvbGQgc2hhZG93IGJyZWFrcG9pbnRcbiAgICAgIC8vIGFuZCBjcmVhdGUgYSBuZXcgb25lLlxuICAgICAgdGhpcy5fcmVtb3ZlTGFzdFNoYWRvd0JyZWFrcG9pbnQoKVxuICAgICAgdGhpcy5fY3JlYXRlU2hhZG93QnJlYWtwb2ludEF0TGluZSh0aGlzLl9lZGl0b3IsIGN1ckxpbmUpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICB9XG5cbiAgX2hhbmRsZUd1dHRlck1vdXNlRW50ZXIoZXZlbnQ6IEV2ZW50KTogdm9pZCB7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgdGhpcy5fYm91bmRHbG9iYWxNb3VzZU1vdmVIYW5kbGVyKVxuICB9XG5cbiAgLy8gVGhpcyBpcyBhIGdpYW50IGhhY2sgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIGJyZWFrcG9pbnQgYWN0dWFsbHkgZGlzYXBwZWFycy5cbiAgLy8gVGhlIGlzc3VlIGlzIHRoYXQgbW91c2VsZWF2ZSBldmVudCBpcyBzb21ldGltZXMgbm90IHRyaWdnZXJlZCBvbiB0aGUgZ3V0dGVyXG4gIC8vIEkodmpldXgpIGFuZCBtYXR0aGV3aXRoYW5tIHNwZW50IG11bHRpcGxlIGVudGlyZSBkYXlzIHRyeWluZyB0byBmaWd1cmUgb3V0XG4gIC8vIHdoeSB3aXRob3V0IHN1Y2Nlc3MsIHNvIHRoaXMgaXMgZ29pbmcgdG8gaGF2ZSB0byBkbyA6KFxuICBfaGFuZGxlR2xvYmFsTW91c2VMZWF2ZShldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5fZWRpdG9yKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgdmlldyA9IGF0b20udmlld3MuZ2V0Vmlldyh0aGlzLl9lZGl0b3IpXG4gICAgY29uc3QgcmVjdCA9IHZpZXcuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICBpZiAoXG4gICAgICBldmVudC5jbGllbnRYIDwgcmVjdC5sZWZ0IHx8XG4gICAgICBldmVudC5jbGllbnRYID4gcmVjdC5yaWdodCB8fFxuICAgICAgZXZlbnQuY2xpZW50WSA8IHJlY3QudG9wIHx8XG4gICAgICBldmVudC5jbGllbnRZID4gcmVjdC5ib3R0b21cbiAgICApIHtcbiAgICAgIHRoaXMuX3JlbW92ZUxhc3RTaGFkb3dCcmVha3BvaW50KClcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIHRoaXMuX2JvdW5kR2xvYmFsTW91c2VNb3ZlSGFuZGxlcilcbiAgICB9XG4gIH1cblxuICBfaGFuZGxlR3V0dGVyTW91c2VMZWF2ZShldmVudDogRXZlbnQpOiB2b2lkIHtcbiAgICB0aGlzLl9yZW1vdmVMYXN0U2hhZG93QnJlYWtwb2ludCgpXG4gIH1cblxuICBfaXNMaW5lT3Zlckxhc3RTaGFkb3dCcmVha3BvaW50KGN1ckxpbmU6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHNoYWRvd0JyZWFrcG9pbnRNYXJrZXIgPSB0aGlzLl9sYXN0U2hhZG93QnJlYWtwb2ludE1hcmtlclxuICAgIHJldHVybiBzaGFkb3dCcmVha3BvaW50TWFya2VyICE9IG51bGwgJiYgc2hhZG93QnJlYWtwb2ludE1hcmtlci5nZXRTdGFydEJ1ZmZlclBvc2l0aW9uKCkucm93ID09PSBjdXJMaW5lXG4gIH1cblxuICBfcmVtb3ZlTGFzdFNoYWRvd0JyZWFrcG9pbnQoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuX2xhc3RTaGFkb3dCcmVha3BvaW50TWFya2VyICE9IG51bGwpIHtcbiAgICAgIHRoaXMuX2xhc3RTaGFkb3dCcmVha3BvaW50TWFya2VyLmRlc3Ryb3koKVxuICAgICAgdGhpcy5fbGFzdFNoYWRvd0JyZWFrcG9pbnRNYXJrZXIgPSBudWxsXG4gICAgfVxuICB9XG5cbiAgX2NyZWF0ZVNoYWRvd0JyZWFrcG9pbnRBdExpbmUoZWRpdG9yOiBUZXh0RWRpdG9yLCBsaW5lOiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBicmVha3BvaW50c0F0TGluZSA9IHRoaXMuX21hcmtlcnMuZmlsdGVyKChtYXJrZXIpID0+IG1hcmtlci5nZXRTdGFydEJ1ZmZlclBvc2l0aW9uKCkucm93ID09PSBsaW5lKVxuXG4gICAgLy8gRG9uJ3QgY3JlYXRlIGEgc2hhZG93IGJyZWFrcG9pbnQgYXQgYSBsaW5lIHRoYXQgYWxyZWFkeSBoYXMgYSBicmVha3BvaW50LlxuICAgIGlmIChicmVha3BvaW50c0F0TGluZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHRoaXMuX2xhc3RTaGFkb3dCcmVha3BvaW50TWFya2VyID0gdGhpcy5fY3JlYXRlQnJlYWtwb2ludE1hcmtlckF0TGluZShcbiAgICAgICAgbGluZSxcbiAgICAgICAgdHJ1ZSwgLy8gaXNTaGFkb3dcbiAgICAgICAgbnVsbFxuICAgICAgKVxuICAgIH1cbiAgfVxuXG4gIF9jcmVhdGVCcmVha3BvaW50TWFya2VyQXRMaW5lKGxpbmU6IG51bWJlciwgaXNTaGFkb3c6IGJvb2xlYW4sIGJyZWFrcG9pbnQ6ID9JQnJlYWtwb2ludCk6IGF0b20kTWFya2VyIHtcbiAgICBjb25zdCBlbmFibGVkID0gYnJlYWtwb2ludCAhPSBudWxsID8gYnJlYWtwb2ludC5lbmFibGVkIDogdHJ1ZVxuICAgIGNvbnN0IHJlc29sdmVkID0gYnJlYWtwb2ludCAhPSBudWxsID8gYnJlYWtwb2ludC52ZXJpZmllZCA6IGZhbHNlXG4gICAgY29uc3QgY29uZGl0aW9uID0gYnJlYWtwb2ludCAhPSBudWxsID8gYnJlYWtwb2ludC5jb25kaXRpb24gOiBudWxsXG4gICAgY29uc3QgbWFya2VyID0gdGhpcy5fZWRpdG9yLm1hcmtCdWZmZXJQb3NpdGlvbihbbGluZSwgMF0sIHtcbiAgICAgIGludmFsaWRhdGU6IFwibmV2ZXJcIixcbiAgICB9KVxuXG4gICAgLy8gSWYgdGhlIGRlYnVnZ2VyIGlzIG5vdCBhdHRhY2hlZCwgZGlzcGxheSBhbGwgYnJlYWtwb2ludHMgYXMgcmVzb2x2ZWQuXG4gICAgLy8gT25jZSB0aGUgZGVidWdnZXIgYXR0YWNoZXMsIGl0IHdpbGwgZGV0ZXJtaW5lIHdoYXQncyBhY3R1YWxseSByZXNvbHZlZCBvciBub3QuXG4gICAgY29uc3QgdW5yZXNvbHZlZCA9IHRoaXMuX2RlYnVnZ2luZyAmJiAhcmVzb2x2ZWRcbiAgICBjb25zdCBjb25kaXRpb25hbCA9IGNvbmRpdGlvbiAhPSBudWxsXG4gICAgY29uc3QgZWxlbTogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKVxuICAgIGVsZW0uZGF0YXNldC5saW5lID0gbGluZS50b1N0cmluZygpXG5cbiAgICBpZiAoYnJlYWtwb2ludCAhPSBudWxsKSB7XG4gICAgICBlbGVtLmRhdGFzZXQuYnBJZCA9IGJyZWFrcG9pbnQuZ2V0SWQoKVxuICAgIH1cblxuICAgIGVsZW0uY2xhc3NOYW1lID0gY2xhc3NuYW1lcyh7XG4gICAgICBcImRlYnVnZ2VyLWJyZWFrcG9pbnQtaWNvblwiOiAhaXNTaGFkb3cgJiYgZW5hYmxlZCAmJiAhdW5yZXNvbHZlZCxcbiAgICAgIFwiZGVidWdnZXItYnJlYWtwb2ludC1pY29uLWNvbmRpdGlvbmFsXCI6IGNvbmRpdGlvbmFsLFxuICAgICAgXCJkZWJ1Z2dlci1icmVha3BvaW50LWljb24tbm9uY29uZGl0aW9uYWxcIjogIWNvbmRpdGlvbmFsLFxuICAgICAgXCJkZWJ1Z2dlci1zaGFkb3ctYnJlYWtwb2ludC1pY29uXCI6IGlzU2hhZG93LFxuICAgICAgXCJkZWJ1Z2dlci1icmVha3BvaW50LWljb24tZGlzYWJsZWRcIjogIWlzU2hhZG93ICYmICFlbmFibGVkLFxuICAgICAgXCJkZWJ1Z2dlci1icmVha3BvaW50LWljb24tdW5yZXNvbHZlZFwiOiAhaXNTaGFkb3cgJiYgZW5hYmxlZCAmJiB1bnJlc29sdmVkLFxuICAgIH0pXG5cbiAgICBpZiAoIWlzU2hhZG93KSB7XG4gICAgICBpZiAoIWVuYWJsZWQpIHtcbiAgICAgICAgZWxlbS50aXRsZSA9IFwiRGlzYWJsZWQgYnJlYWtwb2ludFwiXG4gICAgICB9IGVsc2UgaWYgKHVucmVzb2x2ZWQpIHtcbiAgICAgICAgZWxlbS50aXRsZSA9IFwiVW5yZXNvbHZlZCBicmVha3BvaW50XCJcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVsZW0udGl0bGUgPSBcIkJyZWFrcG9pbnRcIlxuICAgICAgfVxuXG4gICAgICBpZiAoY29uZGl0aW9uYWwpIHtcbiAgICAgICAgZWxlbS50aXRsZSArPSBgIChDb25kaXRpb246ICR7Y29uZGl0aW9uIHx8IFwiXCJ9KWBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpbnZhcmlhbnQodGhpcy5fZ3V0dGVyICE9IG51bGwpXG4gICAgdGhpcy5fZ3V0dGVyLmRlY29yYXRlTWFya2VyKG1hcmtlciwgeyBpdGVtOiBlbGVtIH0pXG4gICAgcmV0dXJuIG1hcmtlclxuICB9XG59XG4iXX0=