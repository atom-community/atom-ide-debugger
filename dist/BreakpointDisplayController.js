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

var _rxjs = require("rxjs");

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

    this._disposables.addUntilDestroyed(editor, gutter.onDidDestroy(this._handleGutterDestroyed.bind(this)), editor.observeGutters(this._registerGutterMouseHandlers.bind(this)), _rxjs.Observable.merge((0, _event.observableFromSubscribeFunction)(debuggerModel.onDidChangeBreakpoints.bind(debuggerModel)), (0, _event.observableFromSubscribeFunction)(this._service.viewModel.onDidChangeDebuggerFocus.bind(this._service.viewModel))) // Debounce to account for bulk updates and not block the UI
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyZWFrcG9pbnREaXNwbGF5Q29udHJvbGxlci5qcyJdLCJuYW1lcyI6WyJCcmVha3BvaW50RGlzcGxheUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImRlbGVnYXRlIiwic2VydmljZSIsImVkaXRvciIsIl9zZXJ2aWNlIiwiX2RlbGVnYXRlIiwiX2Rpc3Bvc2FibGVzIiwiX2VkaXRvciIsIl9ndXR0ZXIiLCJfbWFya2VycyIsIl9tYXJrZXJJbmZvIiwiX2xhc3RTaGFkb3dCcmVha3BvaW50TWFya2VyIiwiX2JvdW5kR2xvYmFsTW91c2VNb3ZlSGFuZGxlciIsIl9ib3VuZENyZWF0ZUNvbnRleHRNZW51SGFuZGxlciIsIl9kZWJ1Z2dpbmciLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwiTWFwIiwiX2hhbmRsZUdsb2JhbE1vdXNlTGVhdmUiLCJiaW5kIiwiX2hhbmRsZUNyZWF0ZUNvbnRleHRNZW51IiwiX2lzRGVidWdnaW5nIiwiZ3V0dGVyIiwiYWRkR3V0dGVyIiwibmFtZSIsInZpc2libGUiLCJwcmlvcml0eSIsImRlYnVnZ2VyTW9kZWwiLCJnZXRNb2RlbCIsImFkZFVudGlsRGVzdHJveWVkIiwib25EaWREZXN0cm95IiwiX2hhbmRsZUd1dHRlckRlc3Ryb3llZCIsIm9ic2VydmVHdXR0ZXJzIiwiX3JlZ2lzdGVyR3V0dGVyTW91c2VIYW5kbGVycyIsIk9ic2VydmFibGUiLCJtZXJnZSIsIm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMiLCJ2aWV3TW9kZWwiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJsZXQiLCJzdGFydFdpdGgiLCJzdWJzY3JpYmUiLCJfdXBkYXRlIiwiX2hhbmRsZVRleHRFZGl0b3JEZXN0cm95ZWQiLCJfcmVnaXN0ZXJFZGl0b3JDb250ZXh0TWVudUhhbmRsZXIiLCJnZXRQcm9jZXNzZXMiLCJzb21lIiwicHJvY2VzcyIsImRlYnVnZ2VyTW9kZSIsIkRlYnVnZ2VyTW9kZSIsIlNUT1BQRUQiLCJlZGl0b3JFbGVtZW50IiwiYXRvbSIsInZpZXdzIiwiZ2V0VmlldyIsImFkZEV2ZW50TGlzdGVuZXIiLCJyZW1vdmVFdmVudExpc3RlbmVyIiwiZ3V0dGVyVmlldyIsImJvdW5kQ2xpY2tIYW5kbGVyIiwiX2hhbmRsZUd1dHRlckNsaWNrIiwiYm91bmRNb3VzZU1vdmVIYW5kbGVyIiwiX2hhbmRsZUd1dHRlck1vdXNlTW92ZSIsImJvdW5kTW91c2VFbnRlckhhbmRsZXIiLCJfaGFuZGxlR3V0dGVyTW91c2VFbnRlciIsImJvdW5kTW91c2VMZWF2ZUhhbmRsZXIiLCJfaGFuZGxlR3V0dGVyTW91c2VMZWF2ZSIsImFkZCIsIndpbmRvdyIsImV2ZW50IiwiYnV0dG9uIiwicHJldmVudERlZmF1bHQiLCJzdG9wUHJvcGFnYXRpb24iLCJtZW51VGVtcGxhdGUiLCJjb250ZXh0TWVudSIsInRlbXBsYXRlRm9yRXZlbnQiLCJkZWJ1Z2dlckdyb3VwSW5kZXgiLCJmaW5kSW5kZXgiLCJpdGVtIiwibGFiZWwiLCJkZWJ1Z2dlckdyb3VwIiwic3BsaWNlIiwidW5zaGlmdCIsInN1Ym1lbnUiLCJ0eXBlIiwiZGlzcG9zZSIsImZvckVhY2giLCJtYXJrZXIiLCJkZXN0cm95IiwiZ2V0RWRpdG9yIiwiaGFuZGxlVGV4dEVkaXRvckRlc3Ryb3llZCIsIl9uZWVkc1VwZGF0ZSIsImxpbmUiLCJicCIsImluZm8iLCJnZXQiLCJlbmFibGVkIiwicmVzb2x2ZWQiLCJ2ZXJpZmllZCIsImNvbmRpdGlvbmFsIiwiY29uZGl0aW9uIiwiX2dldExpbmVGb3JCcCIsImRlYnVnZ2luZyIsInBhdGgiLCJnZXRQYXRoIiwiYWxsQnJlYWtwb2ludHMiLCJnZXRCcmVha3BvaW50cyIsImJyZWFrcG9pbnRzIiwiZmlsdGVyIiwidXJpIiwibGluZU1hcCIsIm1hcCIsInVuaGFuZGxlZExpbmVzIiwiU2V0Iiwia2V5cyIsIm1hcmtlcnNUb0tlZXAiLCJnZXRTdGFydEJ1ZmZlclBvc2l0aW9uIiwicm93IiwiaGFzIiwicHVzaCIsImRlbGV0ZSIsImZpbGVMZW5ndGgiLCJnZXRMaW5lQ291bnQiLCJicmVha3BvaW50IiwicmVtb3ZlQnJlYWtwb2ludHMiLCJnZXRJZCIsIl9jcmVhdGVCcmVha3BvaW50TWFya2VyQXRMaW5lIiwic2V0Iiwib25EaWRDaGFuZ2UiLCJfaGFuZGxlTWFya2VyQ2hhbmdlIiwic2hvdyIsImxlbmd0aCIsImlzVmFsaWQiLCJvbGRIZWFkQnVmZmVyUG9zaXRpb24iLCJuZXdIZWFkQnVmZmVyUG9zaXRpb24iLCJuZXdCcCIsImlkIiwiY29sdW1uIiwidXBkYXRlQnJlYWtwb2ludHMiLCJ0YXJnZXQiLCJjbGFzc0xpc3QiLCJjb250YWlucyIsImN1ckxpbmUiLCJfZ2V0Q3VycmVudE1vdXNlRXZlbnRMaW5lIiwidG9nZ2xlU291cmNlQnJlYWtwb2ludCIsImdldEJyZWFrcG9pbnRBdExpbmUiLCJmZWF0dXJlQ29uZmlnIiwiY29tbWFuZHMiLCJkaXNwYXRjaCIsIndvcmtzcGFjZSIsInNob3dPbmx5SWZIaWRkZW4iLCJlIiwiYnVmZmVyUG9zIiwiX2lzTGluZU92ZXJMYXN0U2hhZG93QnJlYWtwb2ludCIsIl9yZW1vdmVMYXN0U2hhZG93QnJlYWtwb2ludCIsIl9jcmVhdGVTaGFkb3dCcmVha3BvaW50QXRMaW5lIiwidmlldyIsInJlY3QiLCJnZXRCb3VuZGluZ0NsaWVudFJlY3QiLCJjbGllbnRYIiwibGVmdCIsInJpZ2h0IiwiY2xpZW50WSIsInRvcCIsImJvdHRvbSIsInNoYWRvd0JyZWFrcG9pbnRNYXJrZXIiLCJicmVha3BvaW50c0F0TGluZSIsImlzU2hhZG93IiwibWFya0J1ZmZlclBvc2l0aW9uIiwiaW52YWxpZGF0ZSIsInVucmVzb2x2ZWQiLCJlbGVtIiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwiZGF0YXNldCIsInRvU3RyaW5nIiwiYnBJZCIsImNsYXNzTmFtZSIsInRpdGxlIiwiZGVjb3JhdGVNYXJrZXIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFD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QUFDTyxLQUFMLElBQWUsZ0JBQWU5RSxTQUFTLElBQUksRUFBRyxHQUE5QztBQUNEO0FBQ0Y7O0FBRUQseUJBQVUsS0FBSzFGLE9BQUwsSUFBZ0IsSUFBMUI7O0FBQ0EsU0FBS0EsT0FBTCxDQUFheUssY0FBYixDQUE0QjVGLE1BQTVCLEVBQW9DO0FBQUVULE1BQUFBLElBQUksRUFBRTZGO0FBQVIsS0FBcEM7O0FBQ0EsV0FBT3BGLE1BQVA7QUFDRDs7QUFuYThDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBJQnJlYWtwb2ludCwgSURlYnVnU2VydmljZSwgSVVJQnJlYWtwb2ludCB9IGZyb20gXCIuL3R5cGVzXCJcblxuaW1wb3J0IGludmFyaWFudCBmcm9tIFwiYXNzZXJ0XCJcbmltcG9ydCB7IGJ1ZmZlclBvc2l0aW9uRm9yTW91c2VFdmVudCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy1hdG9tL21vdXNlLXRvLXBvc2l0aW9uXCJcbmltcG9ydCB7IG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXZlbnRcIlxuaW1wb3J0IHsgZmFzdERlYm91bmNlIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL29ic2VydmFibGVcIlxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxuaW1wb3J0IHsgc2hvd01lbnVGb3JFdmVudCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy1hdG9tL0NvbnRleHRNZW51XCJcbmltcG9ydCBjbGFzc25hbWVzIGZyb20gXCJjbGFzc25hbWVzXCJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqc1wiXG5pbXBvcnQgeyBEZWJ1Z2dlck1vZGUgfSBmcm9tIFwiLi9jb25zdGFudHNcIlxuaW1wb3J0IGZlYXR1cmVDb25maWcgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLWF0b20vZmVhdHVyZS1jb25maWdcIlxuXG4vKipcbiAqIEEgc2luZ2xlIGRlbGVnYXRlIHdoaWNoIGhhbmRsZXMgZXZlbnRzIGZyb20gdGhlIG9iamVjdC5cbiAqXG4gKiBUaGlzIGlzIHNpbXBsZXIgdGhhbiByZWdpc3RlcmluZyBoYW5kbGVycyB1c2luZyBlbWl0dGVyIGV2ZW50cyBkaXJlY3RseSwgYXNcbiAqIHRoZXJlJ3MgbGVzcyBtZXNzeSBib29ra2VlcGluZyByZWdhcmRpbmcgbGlmZXRpbWVzIG9mIHRoZSB1bnJlZ2lzdGVyXG4gKiBEaXNwb3NhYmxlIG9iamVjdHMuXG4gKi9cbnR5cGUgQnJlYWtwb2ludERpc3BsYXlDb250cm9sbGVyRGVsZWdhdGUgPSB7XG4gICtoYW5kbGVUZXh0RWRpdG9yRGVzdHJveWVkOiAoY29udHJvbGxlcjogQnJlYWtwb2ludERpc3BsYXlDb250cm9sbGVyKSA9PiB2b2lkLFxufVxuXG50eXBlIEJyZWFrcG9pbnRNYXJrZXJQcm9wZXJ0aWVzID0ge1xuICBlbmFibGVkOiBib29sZWFuLFxuICByZXNvbHZlZDogYm9vbGVhbixcbiAgY29uZGl0aW9uYWw6IGJvb2xlYW4sXG59XG5cbi8qKlxuICogSGFuZGxlcyBkaXNwbGF5aW5nIGJyZWFrcG9pbnRzIGFuZCBwcm9jZXNzaW5nIGV2ZW50cyBmb3IgYSBzaW5nbGUgdGV4dFxuICogZWRpdG9yLlxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBCcmVha3BvaW50RGlzcGxheUNvbnRyb2xsZXIge1xuICBfc2VydmljZTogSURlYnVnU2VydmljZVxuICBfZGVsZWdhdGU6IEJyZWFrcG9pbnREaXNwbGF5Q29udHJvbGxlckRlbGVnYXRlXG4gIF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxuICBfZWRpdG9yOiBhdG9tJFRleHRFZGl0b3JcbiAgX2d1dHRlcjogP2F0b20kR3V0dGVyXG4gIF9tYXJrZXJzOiBBcnJheTxhdG9tJE1hcmtlcj5cbiAgX21hcmtlckluZm86IE1hcDxudW1iZXIsIEJyZWFrcG9pbnRNYXJrZXJQcm9wZXJ0aWVzPlxuICBfbGFzdFNoYWRvd0JyZWFrcG9pbnRNYXJrZXI6ID9hdG9tJE1hcmtlclxuICBfYm91bmRHbG9iYWxNb3VzZU1vdmVIYW5kbGVyOiAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHZvaWRcbiAgX2JvdW5kQ3JlYXRlQ29udGV4dE1lbnVIYW5kbGVyOiAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHZvaWRcbiAgX2RlYnVnZ2luZzogYm9vbGVhblxuXG4gIGNvbnN0cnVjdG9yKGRlbGVnYXRlOiBCcmVha3BvaW50RGlzcGxheUNvbnRyb2xsZXJEZWxlZ2F0ZSwgc2VydmljZTogSURlYnVnU2VydmljZSwgZWRpdG9yOiBhdG9tJFRleHRFZGl0b3IpIHtcbiAgICB0aGlzLl9kZWxlZ2F0ZSA9IGRlbGVnYXRlXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5fc2VydmljZSA9IHNlcnZpY2VcbiAgICB0aGlzLl9lZGl0b3IgPSBlZGl0b3JcbiAgICB0aGlzLl9tYXJrZXJzID0gW11cbiAgICB0aGlzLl9tYXJrZXJJbmZvID0gbmV3IE1hcCgpXG4gICAgdGhpcy5fbGFzdFNoYWRvd0JyZWFrcG9pbnRNYXJrZXIgPSBudWxsXG4gICAgdGhpcy5fYm91bmRHbG9iYWxNb3VzZU1vdmVIYW5kbGVyID0gdGhpcy5faGFuZGxlR2xvYmFsTW91c2VMZWF2ZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5fYm91bmRDcmVhdGVDb250ZXh0TWVudUhhbmRsZXIgPSB0aGlzLl9oYW5kbGVDcmVhdGVDb250ZXh0TWVudS5iaW5kKHRoaXMpXG4gICAgdGhpcy5fZGVidWdnaW5nID0gdGhpcy5faXNEZWJ1Z2dpbmcoKVxuXG4gICAgLy8gQ29uZmlndXJlIHRoZSBndXR0ZXIuXG4gICAgY29uc3QgZ3V0dGVyID0gZWRpdG9yLmFkZEd1dHRlcih7XG4gICAgICBuYW1lOiBcImRlYnVnZ2VyLWJyZWFrcG9pbnRcIixcbiAgICAgIHZpc2libGU6IGZhbHNlLFxuICAgICAgLy8gUHJpb3JpdHkgaXMgLTIwMCBieSBkZWZhdWx0IGFuZCAwIGlzIHRoZSBsaW5lIG51bWJlclxuICAgICAgcHJpb3JpdHk6IC0xMTAwLFxuICAgIH0pXG4gICAgY29uc3QgZGVidWdnZXJNb2RlbCA9IHRoaXMuX3NlcnZpY2UuZ2V0TW9kZWwoKVxuICAgIHRoaXMuX2d1dHRlciA9IGd1dHRlclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZFVudGlsRGVzdHJveWVkKFxuICAgICAgZWRpdG9yLFxuICAgICAgZ3V0dGVyLm9uRGlkRGVzdHJveSh0aGlzLl9oYW5kbGVHdXR0ZXJEZXN0cm95ZWQuYmluZCh0aGlzKSksXG4gICAgICBlZGl0b3Iub2JzZXJ2ZUd1dHRlcnModGhpcy5fcmVnaXN0ZXJHdXR0ZXJNb3VzZUhhbmRsZXJzLmJpbmQodGhpcykpLFxuICAgICAgT2JzZXJ2YWJsZS5tZXJnZShcbiAgICAgICAgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihkZWJ1Z2dlck1vZGVsLm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMuYmluZChkZWJ1Z2dlck1vZGVsKSksXG4gICAgICAgIG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24odGhpcy5fc2VydmljZS52aWV3TW9kZWwub25EaWRDaGFuZ2VEZWJ1Z2dlckZvY3VzLmJpbmQodGhpcy5fc2VydmljZS52aWV3TW9kZWwpKVxuICAgICAgKVxuICAgICAgICAvLyBEZWJvdW5jZSB0byBhY2NvdW50IGZvciBidWxrIHVwZGF0ZXMgYW5kIG5vdCBibG9jayB0aGUgVUlcbiAgICAgICAgLmxldChmYXN0RGVib3VuY2UoMTApKVxuICAgICAgICAuc3RhcnRXaXRoKG51bGwpXG4gICAgICAgIC5zdWJzY3JpYmUodGhpcy5fdXBkYXRlLmJpbmQodGhpcykpLFxuICAgICAgdGhpcy5fZWRpdG9yLm9uRGlkRGVzdHJveSh0aGlzLl9oYW5kbGVUZXh0RWRpdG9yRGVzdHJveWVkLmJpbmQodGhpcykpLFxuICAgICAgdGhpcy5fcmVnaXN0ZXJFZGl0b3JDb250ZXh0TWVudUhhbmRsZXIoKVxuICAgIClcbiAgfVxuXG4gIF9pc0RlYnVnZ2luZygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5fc2VydmljZVxuICAgICAgLmdldE1vZGVsKClcbiAgICAgIC5nZXRQcm9jZXNzZXMoKVxuICAgICAgLnNvbWUoKHByb2Nlc3MpID0+IHByb2Nlc3MuZGVidWdnZXJNb2RlICE9PSBEZWJ1Z2dlck1vZGUuU1RPUFBFRClcbiAgfVxuXG4gIF9yZWdpc3RlckVkaXRvckNvbnRleHRNZW51SGFuZGxlcigpOiBJRGlzcG9zYWJsZSB7XG4gICAgY29uc3QgZWRpdG9yRWxlbWVudCA9IGF0b20udmlld3MuZ2V0Vmlldyh0aGlzLl9lZGl0b3IpXG4gICAgZWRpdG9yRWxlbWVudC5hZGRFdmVudExpc3RlbmVyKFwiY29udGV4dG1lbnVcIiwgdGhpcy5fYm91bmRDcmVhdGVDb250ZXh0TWVudUhhbmRsZXIpXG4gICAgcmV0dXJuIG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKCgpID0+XG4gICAgICBlZGl0b3JFbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjb250ZXh0bWVudVwiLCB0aGlzLl9ib3VuZENyZWF0ZUNvbnRleHRNZW51SGFuZGxlcilcbiAgICApXG4gIH1cblxuICBfcmVnaXN0ZXJHdXR0ZXJNb3VzZUhhbmRsZXJzKGd1dHRlcjogYXRvbSRHdXR0ZXIpOiB2b2lkIHtcbiAgICBjb25zdCBndXR0ZXJWaWV3ID0gYXRvbS52aWV3cy5nZXRWaWV3KGd1dHRlcilcbiAgICBpZiAoZ3V0dGVyLm5hbWUgIT09IFwibGluZS1udW1iZXJcIiAmJiBndXR0ZXIubmFtZSAhPT0gXCJkZWJ1Z2dlci1icmVha3BvaW50XCIpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCBib3VuZENsaWNrSGFuZGxlciA9IHRoaXMuX2hhbmRsZUd1dHRlckNsaWNrLmJpbmQodGhpcylcbiAgICBjb25zdCBib3VuZE1vdXNlTW92ZUhhbmRsZXIgPSB0aGlzLl9oYW5kbGVHdXR0ZXJNb3VzZU1vdmUuYmluZCh0aGlzKVxuICAgIGNvbnN0IGJvdW5kTW91c2VFbnRlckhhbmRsZXIgPSB0aGlzLl9oYW5kbGVHdXR0ZXJNb3VzZUVudGVyLmJpbmQodGhpcylcbiAgICBjb25zdCBib3VuZE1vdXNlTGVhdmVIYW5kbGVyID0gdGhpcy5faGFuZGxlR3V0dGVyTW91c2VMZWF2ZS5iaW5kKHRoaXMpXG4gICAgLy8gQWRkIG1vdXNlIGxpc3RlbmVycyBndXR0ZXIgZm9yIHNldHRpbmcgYnJlYWtwb2ludHMuXG4gICAgZ3V0dGVyVmlldy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYm91bmRDbGlja0hhbmRsZXIpXG4gICAgZ3V0dGVyVmlldy5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIGJvdW5kTW91c2VNb3ZlSGFuZGxlcilcbiAgICBndXR0ZXJWaWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWVudGVyXCIsIGJvdW5kTW91c2VFbnRlckhhbmRsZXIpXG4gICAgZ3V0dGVyVmlldy5hZGRFdmVudExpc3RlbmVyKFwibW91c2VsZWF2ZVwiLCBib3VuZE1vdXNlTGVhdmVIYW5kbGVyKVxuICAgIGd1dHRlclZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcImNvbnRleHRtZW51XCIsIHRoaXMuX2JvdW5kQ3JlYXRlQ29udGV4dE1lbnVIYW5kbGVyKVxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcbiAgICAgICgpID0+IGd1dHRlclZpZXcucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGJvdW5kQ2xpY2tIYW5kbGVyKSxcbiAgICAgICgpID0+IGd1dHRlclZpZXcucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBib3VuZE1vdXNlTW92ZUhhbmRsZXIpLFxuICAgICAgKCkgPT4gZ3V0dGVyVmlldy5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2VlbnRlclwiLCBib3VuZE1vdXNlRW50ZXJIYW5kbGVyKSxcbiAgICAgICgpID0+IGd1dHRlclZpZXcucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNlbGVhdmVcIiwgYm91bmRNb3VzZUxlYXZlSGFuZGxlciksXG4gICAgICAoKSA9PiBndXR0ZXJWaWV3LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjb250ZXh0bWVudVwiLCB0aGlzLl9ib3VuZENyZWF0ZUNvbnRleHRNZW51SGFuZGxlciksXG4gICAgICAoKSA9PiB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCB0aGlzLl9ib3VuZEdsb2JhbE1vdXNlTW92ZUhhbmRsZXIpXG4gICAgKVxuICB9XG5cbiAgX2hhbmRsZUNyZWF0ZUNvbnRleHRNZW51KGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XG4gICAgaWYgKGV2ZW50LmJ1dHRvbiAhPT0gMiB8fCAhdGhpcy5faXNEZWJ1Z2dpbmcoKSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXG5cbiAgICBjb25zdCBtZW51VGVtcGxhdGUgPSBhdG9tLmNvbnRleHRNZW51LnRlbXBsYXRlRm9yRXZlbnQoZXZlbnQpXG4gICAgY29uc3QgZGVidWdnZXJHcm91cEluZGV4ID0gbWVudVRlbXBsYXRlLmZpbmRJbmRleCgoaXRlbSkgPT4gaXRlbS5sYWJlbCA9PT0gXCJEZWJ1Z2dlclwiKVxuICAgIGNvbnN0IFtkZWJ1Z2dlckdyb3VwXSA9IG1lbnVUZW1wbGF0ZS5zcGxpY2UoZGVidWdnZXJHcm91cEluZGV4LCAxKVxuICAgIG1lbnVUZW1wbGF0ZS51bnNoaWZ0KC4uLmRlYnVnZ2VyR3JvdXAuc3VibWVudSwgeyB0eXBlOiBcInNlcGFyYXRvclwiIH0pXG4gICAgc2hvd01lbnVGb3JFdmVudChldmVudCwgbWVudVRlbXBsYXRlKVxuICB9XG5cbiAgZGlzcG9zZSgpIHtcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgICB0aGlzLl9tYXJrZXJzLmZvckVhY2goKG1hcmtlcikgPT4gbWFya2VyLmRlc3Ryb3koKSlcbiAgICBpZiAodGhpcy5fZ3V0dGVyKSB7XG4gICAgICB0aGlzLl9ndXR0ZXIuZGVzdHJveSgpXG4gICAgfVxuICB9XG5cbiAgZ2V0RWRpdG9yKCk6IGF0b20kVGV4dEVkaXRvciB7XG4gICAgcmV0dXJuIHRoaXMuX2VkaXRvclxuICB9XG5cbiAgX2hhbmRsZVRleHRFZGl0b3JEZXN0cm95ZWQoKSB7XG4gICAgLy8gR3V0dGVyLmRlc3Ryb3kgc2VlbXMgdG8gZmFpbCBhZnRlciB0ZXh0IGVkaXRvciBpcyBkZXN0cm95ZWQsIGFuZFxuICAgIC8vIEd1dHRlci5vbkRpZERlc3Ryb3kgZG9lc24ndCBzZWVtIHRvIGJlIGNhbGxlZCBpbiB0aGF0IGNhc2UuXG4gICAgdGhpcy5fZ3V0dGVyID0gbnVsbFxuICAgIHRoaXMuX2RlbGVnYXRlLmhhbmRsZVRleHRFZGl0b3JEZXN0cm95ZWQodGhpcylcbiAgfVxuXG4gIF9oYW5kbGVHdXR0ZXJEZXN0cm95ZWQoKSB7XG4gICAgLy8gSWYgZ3V0dGVyIGlzIGRlc3Ryb3llZCBieSBzb21lIG91dHNpZGUgZm9yY2UsIGVuc3VyZSB0aGUgZ3V0dGVyIGlzIG5vdFxuICAgIC8vIGRlc3Ryb3llZCBhZ2Fpbi5cbiAgICB0aGlzLl9ndXR0ZXIgPSBudWxsXG4gIH1cblxuICBfbmVlZHNVcGRhdGUobGluZTogbnVtYmVyLCBicDogP0lCcmVha3BvaW50KTogYm9vbGVhbiB7XG4gICAgLy8gQ2hlY2tzIGlmIGFuIGV4aXN0aW5nIG1hcmtlciBubyBsb25nZXIgbWF0Y2hlcyB0aGUgcHJvcGVydGllcyBvZiB0aGUgYnJlYWtwb2ludFxuICAgIC8vIGl0IGNvcnJlc3BvbmRzIHRvLlxuICAgIGlmIChicCA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGNvbnN0IGluZm8gPSB0aGlzLl9tYXJrZXJJbmZvLmdldChsaW5lKVxuICAgIGlmIChpbmZvID09IG51bGwpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgaWYgKGluZm8uZW5hYmxlZCAhPT0gYnAuZW5hYmxlZCB8fCBpbmZvLnJlc29sdmVkICE9PSBicC52ZXJpZmllZCB8fCBpbmZvLmNvbmRpdGlvbmFsICE9PSAoYnAuY29uZGl0aW9uICE9IG51bGwpKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgX2dldExpbmVGb3JCcChicDogSUJyZWFrcG9pbnQpOiBudW1iZXIge1xuICAgIC8vIFplcm8tYmFzZWQgYnJlYWtwb2ludHMgbGluZSBtYXAgKHRvIG1hdGNoIFVJIG1hcmtlcnMpLlxuICAgIHJldHVybiBicC5saW5lIC0gMVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSB0aGUgZGlzcGxheSB3aXRoIHRoZSBjdXJyZW50IHNldCBvZiBicmVha3BvaW50cyBmb3IgdGhpcyBlZGl0b3IuXG4gICAqL1xuICBfdXBkYXRlKCk6IHZvaWQge1xuICAgIGNvbnN0IGd1dHRlciA9IHRoaXMuX2d1dHRlclxuICAgIGlmIChndXR0ZXIgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgZGVidWdnaW5nID0gdGhpcy5faXNEZWJ1Z2dpbmcoKVxuXG4gICAgY29uc3QgcGF0aCA9IHRoaXMuX2VkaXRvci5nZXRQYXRoKClcbiAgICBpZiAocGF0aCA9PSBudWxsKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgYWxsQnJlYWtwb2ludHMgPSB0aGlzLl9zZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludHMoKVxuICAgIGNvbnN0IGJyZWFrcG9pbnRzID0gYWxsQnJlYWtwb2ludHMuZmlsdGVyKChicCkgPT4gYnAudXJpID09PSBwYXRoKVxuICAgIGNvbnN0IGxpbmVNYXAgPSBuZXcgTWFwKGJyZWFrcG9pbnRzLm1hcCgoYnApID0+IFt0aGlzLl9nZXRMaW5lRm9yQnAoYnApLCBicF0pKVxuXG4gICAgLy8gQSBtdXRhYmxlIHVuaGFuZGxlZCBsaW5lcyBtYXAuXG4gICAgY29uc3QgdW5oYW5kbGVkTGluZXMgPSBuZXcgU2V0KGxpbmVNYXAua2V5cygpKVxuICAgIGNvbnN0IG1hcmtlcnNUb0tlZXAgPSBbXVxuXG4gICAgLy8gRGVzdHJveSBtYXJrZXJzIHRoYXQgbm8gbG9uZ2VyIGNvcnJlc3BvbmQgdG8gYnJlYWtwb2ludHMuXG4gICAgdGhpcy5fbWFya2Vycy5mb3JFYWNoKChtYXJrZXIpID0+IHtcbiAgICAgIGNvbnN0IGxpbmUgPSBtYXJrZXIuZ2V0U3RhcnRCdWZmZXJQb3NpdGlvbigpLnJvd1xuICAgICAgY29uc3QgYnAgPSBsaW5lTWFwLmdldChsaW5lKVxuICAgICAgaWYgKGRlYnVnZ2luZyA9PT0gdGhpcy5fZGVidWdnaW5nICYmIHVuaGFuZGxlZExpbmVzLmhhcyhsaW5lKSAmJiAhdGhpcy5fbmVlZHNVcGRhdGUobGluZSwgYnApKSB7XG4gICAgICAgIG1hcmtlcnNUb0tlZXAucHVzaChtYXJrZXIpXG4gICAgICAgIHVuaGFuZGxlZExpbmVzLmRlbGV0ZShsaW5lKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fbWFya2VySW5mby5kZWxldGUobGluZSlcbiAgICAgICAgbWFya2VyLmRlc3Ryb3koKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICB0aGlzLl9kZWJ1Z2dpbmcgPSBkZWJ1Z2dpbmdcblxuICAgIGNvbnN0IGZpbGVMZW5ndGggPSB0aGlzLl9lZGl0b3IuZ2V0TGluZUNvdW50KClcblxuICAgIC8vIEFkZCBuZXcgbWFya2VycyBmb3IgYnJlYWtwb2ludHMgd2l0aG91dCBjb3JyZXNwb25kaW5nIG1hcmtlcnMuXG4gICAgZm9yIChjb25zdCBbbGluZSwgYnJlYWtwb2ludF0gb2YgbGluZU1hcCkge1xuICAgICAgLy8gUmVtb3ZlIGFueSBicmVha3BvaW50cyB0aGF0IGFyZSBwYXN0IHRoZSBlbmQgb2YgdGhlIGZpbGUuXG4gICAgICBpZiAobGluZSA+PSBmaWxlTGVuZ3RoKSB7XG4gICAgICAgIHRoaXMuX3NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnJlYWtwb2ludC5nZXRJZCgpKVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuXG4gICAgICBpZiAoIXVuaGFuZGxlZExpbmVzLmhhcyhsaW5lKSkge1xuICAgICAgICAvLyBUaGlzIGxpbmUgaGFzIGJlZW4gaGFuZGxlZC5cbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGNvbnN0IG1hcmtlciA9IHRoaXMuX2NyZWF0ZUJyZWFrcG9pbnRNYXJrZXJBdExpbmUoXG4gICAgICAgIGxpbmUsXG4gICAgICAgIGZhbHNlLCAvLyBpc1NoYWRvd1xuICAgICAgICBicmVha3BvaW50XG4gICAgICApXG5cbiAgICAgIC8vIFJlbWVtYmVyIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBtYXJrZXIgYXQgdGhpcyBsaW5lIHNvIGl0J3MgZWFzeSB0byB0ZWxsIGlmIGl0XG4gICAgICAvLyBuZWVkcyB0byBiZSB1cGRhdGVkIHdoZW4gdGhlIGJyZWFrcG9pbnQgcHJvcGVydGllcyBjaGFuZ2UuXG4gICAgICB0aGlzLl9tYXJrZXJJbmZvLnNldChsaW5lLCB7XG4gICAgICAgIGVuYWJsZWQ6IGJyZWFrcG9pbnQuZW5hYmxlZCxcbiAgICAgICAgcmVzb2x2ZWQ6IGJyZWFrcG9pbnQudmVyaWZpZWQsXG4gICAgICAgIGNvbmRpdGlvbmFsOiBicmVha3BvaW50LmNvbmRpdGlvbiAhPSBudWxsLFxuICAgICAgfSlcbiAgICAgIG1hcmtlci5vbkRpZENoYW5nZSh0aGlzLl9oYW5kbGVNYXJrZXJDaGFuZ2UuYmluZCh0aGlzLCBicmVha3BvaW50KSlcbiAgICAgIG1hcmtlcnNUb0tlZXAucHVzaChtYXJrZXIpXG4gICAgfVxuXG4gICAgZ3V0dGVyLnNob3coKVxuICAgIHRoaXMuX21hcmtlcnMgPSBtYXJrZXJzVG9LZWVwXG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlciBmb3IgbWFya2VyIG1vdmVtZW50cyBkdWUgdG8gdGV4dCBiZWluZyBlZGl0ZWQuXG4gICAqL1xuICBfaGFuZGxlTWFya2VyQ2hhbmdlKGJyZWFrcG9pbnQ6IElCcmVha3BvaW50LCBldmVudDogYXRvbSRNYXJrZXJDaGFuZ2VFdmVudCk6IHZvaWQge1xuICAgIGNvbnN0IHBhdGggPSB0aGlzLl9lZGl0b3IuZ2V0UGF0aCgpXG4gICAgaWYgKHBhdGggPT0gbnVsbCB8fCBwYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmICghZXZlbnQuaXNWYWxpZCkge1xuICAgICAgdGhpcy5fc2VydmljZS5yZW1vdmVCcmVha3BvaW50cyhicmVha3BvaW50LmdldElkKCkpXG4gICAgfSBlbHNlIGlmIChldmVudC5vbGRIZWFkQnVmZmVyUG9zaXRpb24ucm93ICE9PSBldmVudC5uZXdIZWFkQnVmZmVyUG9zaXRpb24ucm93KSB7XG4gICAgICBjb25zdCBuZXdCcDogSVVJQnJlYWtwb2ludCA9IHtcbiAgICAgICAgLy8gVlNQIGlzIDEtYmFzZWQgbGluZSBudW1iZXJzLlxuICAgICAgICBsaW5lOiBldmVudC5uZXdIZWFkQnVmZmVyUG9zaXRpb24ucm93ICsgMSxcbiAgICAgICAgaWQ6IGJyZWFrcG9pbnQuZ2V0SWQoKSxcbiAgICAgICAgdXJpOiBicmVha3BvaW50LnVyaSxcbiAgICAgICAgY29sdW1uOiAwLFxuICAgICAgICBlbmFibGVkOiBicmVha3BvaW50LmVuYWJsZWQsXG4gICAgICB9XG5cbiAgICAgIGlmIChicmVha3BvaW50LmNvbmRpdGlvbiAhPSBudWxsKSB7XG4gICAgICAgIG5ld0JwLmNvbmRpdGlvbiA9IGJyZWFrcG9pbnQuY29uZGl0aW9uXG4gICAgICB9XG5cbiAgICAgIHRoaXMuX3NlcnZpY2UudXBkYXRlQnJlYWtwb2ludHMoW25ld0JwXSlcbiAgICB9XG4gIH1cblxuICBfaGFuZGxlR3V0dGVyQ2xpY2soZXZlbnQ6IEV2ZW50KTogdm9pZCB7XG4gICAgLy8gY2xhc3NMaXN0IGlzbid0IGluIHRoZSBkZWZzIG9mIEV2ZW50VGFyZ2V0Li4uXG4gICAgY29uc3QgdGFyZ2V0OiBIVE1MRWxlbWVudCA9IChldmVudC50YXJnZXQ6IGFueSlcbiAgICBpZiAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucyhcImljb24tcmlnaHRcIikpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IHBhdGggPSB0aGlzLl9lZGl0b3IuZ2V0UGF0aCgpXG4gICAgLy8gZmxvd2xpbnQtbmV4dC1saW5lIHNrZXRjaHktbnVsbC1zdHJpbmc6b2ZmXG4gICAgaWYgKCFwYXRoKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBEb24ndCB0b2dnbGUgYSBicmVha3BvaW50IGlmIHRoZSB1c2VyIGNsaWNrZWQgb24gc29tZXRoaW5nIGluIHRoZSBndXR0ZXIgdGhhdCBpcyBub3RcbiAgICAvLyB0aGUgZGVidWdnZXIsIHN1Y2ggYXMgY2xpY2tpbmcgb24gYSBsaW5lIG51bWJlciB0byBzZWxlY3QgdGhlIGxpbmUuXG4gICAgaWYgKFxuICAgICAgIXRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoXCJkZWJ1Z2dlci1zaGFkb3ctYnJlYWtwb2ludC1pY29uXCIpICYmXG4gICAgICAhdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucyhcImRlYnVnZ2VyLWJyZWFrcG9pbnQtaWNvblwiKSAmJlxuICAgICAgIXRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoXCJkZWJ1Z2dlci1icmVha3BvaW50LWljb24tZGlzYWJsZWRcIikgJiZcbiAgICAgICF0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKFwiZGVidWdnZXItYnJlYWtwb2ludC1pY29uLXVucmVzb2x2ZWRcIikgJiZcbiAgICAgICF0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKFwiZGVidWdnZXItYnJlYWtwb2ludC1pY29uLWNvbmRpdGlvbmFsXCIpXG4gICAgKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgY3VyTGluZSA9IHRoaXMuX2dldEN1cnJlbnRNb3VzZUV2ZW50TGluZShldmVudClcbiAgICAgIHRoaXMuX3NlcnZpY2UudG9nZ2xlU291cmNlQnJlYWtwb2ludChwYXRoLCBjdXJMaW5lICsgMSlcblxuICAgICAgaWYgKHRoaXMuX3NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50QXRMaW5lKHBhdGgsIGN1ckxpbmUgKyAxKSAhPSBudWxsKSB7XG4gICAgICAgIC8vIElmIGEgYnJlYWtwb2ludCB3YXMgYWRkZWQgYW5kIHNob3dEZWJ1Z2dlck9uQnBTZXQgY29uZmlnIHNldHRpbmdcbiAgICAgICAgLy8gaXMgdHJ1ZSwgc2hvdyB0aGUgZGVidWdnZXIuXG4gICAgICAgIGlmIChmZWF0dXJlQ29uZmlnLmdldChcImF0b20taWRlLWRlYnVnZ2VyLnNob3dEZWJ1Z2dlck9uQnBTZXRcIikpIHtcbiAgICAgICAgICBhdG9tLmNvbW1hbmRzLmRpc3BhdGNoKGF0b20udmlld3MuZ2V0VmlldyhhdG9tLndvcmtzcGFjZSksIFwiZGVidWdnZXI6c2hvd1wiLCB7XG4gICAgICAgICAgICBzaG93T25seUlmSGlkZGVuOiB0cnVlLFxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gIH1cblxuICBfZ2V0Q3VycmVudE1vdXNlRXZlbnRMaW5lKGV2ZW50OiBFdmVudCk6IG51bWJlciB7XG4gICAgLy8gJEZsb3dJc3N1ZVxuICAgIGNvbnN0IGJ1ZmZlclBvcyA9IGJ1ZmZlclBvc2l0aW9uRm9yTW91c2VFdmVudChldmVudCwgdGhpcy5fZWRpdG9yKVxuICAgIHJldHVybiBidWZmZXJQb3Mucm93XG4gIH1cblxuICBfaGFuZGxlR3V0dGVyTW91c2VNb3ZlKGV2ZW50OiBFdmVudCk6IHZvaWQge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjdXJMaW5lID0gdGhpcy5fZ2V0Q3VycmVudE1vdXNlRXZlbnRMaW5lKGV2ZW50KVxuICAgICAgaWYgKHRoaXMuX2lzTGluZU92ZXJMYXN0U2hhZG93QnJlYWtwb2ludChjdXJMaW5lKSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIC8vIFVzZXIgbW92ZXMgdG8gYSBuZXcgbGluZSB3ZSBuZWVkIHRvIGRlbGV0ZSB0aGUgb2xkIHNoYWRvdyBicmVha3BvaW50XG4gICAgICAvLyBhbmQgY3JlYXRlIGEgbmV3IG9uZS5cbiAgICAgIHRoaXMuX3JlbW92ZUxhc3RTaGFkb3dCcmVha3BvaW50KClcbiAgICAgIHRoaXMuX2NyZWF0ZVNoYWRvd0JyZWFrcG9pbnRBdExpbmUodGhpcy5fZWRpdG9yLCBjdXJMaW5lKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgfVxuXG4gIF9oYW5kbGVHdXR0ZXJNb3VzZUVudGVyKGV2ZW50OiBFdmVudCk6IHZvaWQge1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIHRoaXMuX2JvdW5kR2xvYmFsTW91c2VNb3ZlSGFuZGxlcilcbiAgfVxuXG4gIC8vIFRoaXMgaXMgYSBnaWFudCBoYWNrIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSBicmVha3BvaW50IGFjdHVhbGx5IGRpc2FwcGVhcnMuXG4gIC8vIFRoZSBpc3N1ZSBpcyB0aGF0IG1vdXNlbGVhdmUgZXZlbnQgaXMgc29tZXRpbWVzIG5vdCB0cmlnZ2VyZWQgb24gdGhlIGd1dHRlclxuICAvLyBJKHZqZXV4KSBhbmQgbWF0dGhld2l0aGFubSBzcGVudCBtdWx0aXBsZSBlbnRpcmUgZGF5cyB0cnlpbmcgdG8gZmlndXJlIG91dFxuICAvLyB3aHkgd2l0aG91dCBzdWNjZXNzLCBzbyB0aGlzIGlzIGdvaW5nIHRvIGhhdmUgdG8gZG8gOihcbiAgX2hhbmRsZUdsb2JhbE1vdXNlTGVhdmUoZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuX2VkaXRvcikge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHZpZXcgPSBhdG9tLnZpZXdzLmdldFZpZXcodGhpcy5fZWRpdG9yKVxuICAgIGNvbnN0IHJlY3QgPSB2aWV3LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgaWYgKFxuICAgICAgZXZlbnQuY2xpZW50WCA8IHJlY3QubGVmdCB8fFxuICAgICAgZXZlbnQuY2xpZW50WCA+IHJlY3QucmlnaHQgfHxcbiAgICAgIGV2ZW50LmNsaWVudFkgPCByZWN0LnRvcCB8fFxuICAgICAgZXZlbnQuY2xpZW50WSA+IHJlY3QuYm90dG9tXG4gICAgKSB7XG4gICAgICB0aGlzLl9yZW1vdmVMYXN0U2hhZG93QnJlYWtwb2ludCgpXG4gICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCB0aGlzLl9ib3VuZEdsb2JhbE1vdXNlTW92ZUhhbmRsZXIpXG4gICAgfVxuICB9XG5cbiAgX2hhbmRsZUd1dHRlck1vdXNlTGVhdmUoZXZlbnQ6IEV2ZW50KTogdm9pZCB7XG4gICAgdGhpcy5fcmVtb3ZlTGFzdFNoYWRvd0JyZWFrcG9pbnQoKVxuICB9XG5cbiAgX2lzTGluZU92ZXJMYXN0U2hhZG93QnJlYWtwb2ludChjdXJMaW5lOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBjb25zdCBzaGFkb3dCcmVha3BvaW50TWFya2VyID0gdGhpcy5fbGFzdFNoYWRvd0JyZWFrcG9pbnRNYXJrZXJcbiAgICByZXR1cm4gc2hhZG93QnJlYWtwb2ludE1hcmtlciAhPSBudWxsICYmIHNoYWRvd0JyZWFrcG9pbnRNYXJrZXIuZ2V0U3RhcnRCdWZmZXJQb3NpdGlvbigpLnJvdyA9PT0gY3VyTGluZVxuICB9XG5cbiAgX3JlbW92ZUxhc3RTaGFkb3dCcmVha3BvaW50KCk6IHZvaWQge1xuICAgIGlmICh0aGlzLl9sYXN0U2hhZG93QnJlYWtwb2ludE1hcmtlciAhPSBudWxsKSB7XG4gICAgICB0aGlzLl9sYXN0U2hhZG93QnJlYWtwb2ludE1hcmtlci5kZXN0cm95KClcbiAgICAgIHRoaXMuX2xhc3RTaGFkb3dCcmVha3BvaW50TWFya2VyID0gbnVsbFxuICAgIH1cbiAgfVxuXG4gIF9jcmVhdGVTaGFkb3dCcmVha3BvaW50QXRMaW5lKGVkaXRvcjogVGV4dEVkaXRvciwgbGluZTogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgYnJlYWtwb2ludHNBdExpbmUgPSB0aGlzLl9tYXJrZXJzLmZpbHRlcigobWFya2VyKSA9PiBtYXJrZXIuZ2V0U3RhcnRCdWZmZXJQb3NpdGlvbigpLnJvdyA9PT0gbGluZSlcblxuICAgIC8vIERvbid0IGNyZWF0ZSBhIHNoYWRvdyBicmVha3BvaW50IGF0IGEgbGluZSB0aGF0IGFscmVhZHkgaGFzIGEgYnJlYWtwb2ludC5cbiAgICBpZiAoYnJlYWtwb2ludHNBdExpbmUubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aGlzLl9sYXN0U2hhZG93QnJlYWtwb2ludE1hcmtlciA9IHRoaXMuX2NyZWF0ZUJyZWFrcG9pbnRNYXJrZXJBdExpbmUoXG4gICAgICAgIGxpbmUsXG4gICAgICAgIHRydWUsIC8vIGlzU2hhZG93XG4gICAgICAgIG51bGxcbiAgICAgIClcbiAgICB9XG4gIH1cblxuICBfY3JlYXRlQnJlYWtwb2ludE1hcmtlckF0TGluZShsaW5lOiBudW1iZXIsIGlzU2hhZG93OiBib29sZWFuLCBicmVha3BvaW50OiA/SUJyZWFrcG9pbnQpOiBhdG9tJE1hcmtlciB7XG4gICAgY29uc3QgZW5hYmxlZCA9IGJyZWFrcG9pbnQgIT0gbnVsbCA/IGJyZWFrcG9pbnQuZW5hYmxlZCA6IHRydWVcbiAgICBjb25zdCByZXNvbHZlZCA9IGJyZWFrcG9pbnQgIT0gbnVsbCA/IGJyZWFrcG9pbnQudmVyaWZpZWQgOiBmYWxzZVxuICAgIGNvbnN0IGNvbmRpdGlvbiA9IGJyZWFrcG9pbnQgIT0gbnVsbCA/IGJyZWFrcG9pbnQuY29uZGl0aW9uIDogbnVsbFxuICAgIGNvbnN0IG1hcmtlciA9IHRoaXMuX2VkaXRvci5tYXJrQnVmZmVyUG9zaXRpb24oW2xpbmUsIDBdLCB7XG4gICAgICBpbnZhbGlkYXRlOiBcIm5ldmVyXCIsXG4gICAgfSlcblxuICAgIC8vIElmIHRoZSBkZWJ1Z2dlciBpcyBub3QgYXR0YWNoZWQsIGRpc3BsYXkgYWxsIGJyZWFrcG9pbnRzIGFzIHJlc29sdmVkLlxuICAgIC8vIE9uY2UgdGhlIGRlYnVnZ2VyIGF0dGFjaGVzLCBpdCB3aWxsIGRldGVybWluZSB3aGF0J3MgYWN0dWFsbHkgcmVzb2x2ZWQgb3Igbm90LlxuICAgIGNvbnN0IHVucmVzb2x2ZWQgPSB0aGlzLl9kZWJ1Z2dpbmcgJiYgIXJlc29sdmVkXG4gICAgY29uc3QgY29uZGl0aW9uYWwgPSBjb25kaXRpb24gIT0gbnVsbFxuICAgIGNvbnN0IGVsZW06IEhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIilcbiAgICBlbGVtLmRhdGFzZXQubGluZSA9IGxpbmUudG9TdHJpbmcoKVxuXG4gICAgaWYgKGJyZWFrcG9pbnQgIT0gbnVsbCkge1xuICAgICAgZWxlbS5kYXRhc2V0LmJwSWQgPSBicmVha3BvaW50LmdldElkKClcbiAgICB9XG5cbiAgICBlbGVtLmNsYXNzTmFtZSA9IGNsYXNzbmFtZXMoe1xuICAgICAgXCJkZWJ1Z2dlci1icmVha3BvaW50LWljb25cIjogIWlzU2hhZG93ICYmIGVuYWJsZWQgJiYgIXVucmVzb2x2ZWQsXG4gICAgICBcImRlYnVnZ2VyLWJyZWFrcG9pbnQtaWNvbi1jb25kaXRpb25hbFwiOiBjb25kaXRpb25hbCxcbiAgICAgIFwiZGVidWdnZXItYnJlYWtwb2ludC1pY29uLW5vbmNvbmRpdGlvbmFsXCI6ICFjb25kaXRpb25hbCxcbiAgICAgIFwiZGVidWdnZXItc2hhZG93LWJyZWFrcG9pbnQtaWNvblwiOiBpc1NoYWRvdyxcbiAgICAgIFwiZGVidWdnZXItYnJlYWtwb2ludC1pY29uLWRpc2FibGVkXCI6ICFpc1NoYWRvdyAmJiAhZW5hYmxlZCxcbiAgICAgIFwiZGVidWdnZXItYnJlYWtwb2ludC1pY29uLXVucmVzb2x2ZWRcIjogIWlzU2hhZG93ICYmIGVuYWJsZWQgJiYgdW5yZXNvbHZlZCxcbiAgICB9KVxuXG4gICAgaWYgKCFpc1NoYWRvdykge1xuICAgICAgaWYgKCFlbmFibGVkKSB7XG4gICAgICAgIGVsZW0udGl0bGUgPSBcIkRpc2FibGVkIGJyZWFrcG9pbnRcIlxuICAgICAgfSBlbHNlIGlmICh1bnJlc29sdmVkKSB7XG4gICAgICAgIGVsZW0udGl0bGUgPSBcIlVucmVzb2x2ZWQgYnJlYWtwb2ludFwiXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlbGVtLnRpdGxlID0gXCJCcmVha3BvaW50XCJcbiAgICAgIH1cblxuICAgICAgaWYgKGNvbmRpdGlvbmFsKSB7XG4gICAgICAgIGVsZW0udGl0bGUgKz0gYCAoQ29uZGl0aW9uOiAke2NvbmRpdGlvbiB8fCBcIlwifSlgXG4gICAgICB9XG4gICAgfVxuXG4gICAgaW52YXJpYW50KHRoaXMuX2d1dHRlciAhPSBudWxsKVxuICAgIHRoaXMuX2d1dHRlci5kZWNvcmF0ZU1hcmtlcihtYXJrZXIsIHsgaXRlbTogZWxlbSB9KVxuICAgIHJldHVybiBtYXJrZXJcbiAgfVxufVxuIl19