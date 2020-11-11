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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyZWFrcG9pbnREaXNwbGF5Q29udHJvbGxlci5qcyJdLCJuYW1lcyI6WyJCcmVha3BvaW50RGlzcGxheUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImRlbGVnYXRlIiwic2VydmljZSIsImVkaXRvciIsIl9zZXJ2aWNlIiwiX2RlbGVnYXRlIiwiX2Rpc3Bvc2FibGVzIiwiX2VkaXRvciIsIl9ndXR0ZXIiLCJfbWFya2VycyIsIl9tYXJrZXJJbmZvIiwiX2xhc3RTaGFkb3dCcmVha3BvaW50TWFya2VyIiwiX2JvdW5kR2xvYmFsTW91c2VNb3ZlSGFuZGxlciIsIl9ib3VuZENyZWF0ZUNvbnRleHRNZW51SGFuZGxlciIsIl9kZWJ1Z2dpbmciLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwiTWFwIiwiX2hhbmRsZUdsb2JhbE1vdXNlTGVhdmUiLCJiaW5kIiwiX2hhbmRsZUNyZWF0ZUNvbnRleHRNZW51IiwiX2lzRGVidWdnaW5nIiwiZ3V0dGVyIiwiYWRkR3V0dGVyIiwibmFtZSIsInZpc2libGUiLCJwcmlvcml0eSIsImRlYnVnZ2VyTW9kZWwiLCJnZXRNb2RlbCIsImFkZFVudGlsRGVzdHJveWVkIiwib25EaWREZXN0cm95IiwiX2hhbmRsZUd1dHRlckRlc3Ryb3llZCIsIm9ic2VydmVHdXR0ZXJzIiwiX3JlZ2lzdGVyR3V0dGVyTW91c2VIYW5kbGVycyIsIk9ic2VydmFibGUiLCJtZXJnZSIsIm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMiLCJ2aWV3TW9kZWwiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJsZXQiLCJzdGFydFdpdGgiLCJzdWJzY3JpYmUiLCJfdXBkYXRlIiwiX2hhbmRsZVRleHRFZGl0b3JEZXN0cm95ZWQiLCJfcmVnaXN0ZXJFZGl0b3JDb250ZXh0TWVudUhhbmRsZXIiLCJnZXRQcm9jZXNzZXMiLCJzb21lIiwicHJvY2VzcyIsImRlYnVnZ2VyTW9kZSIsIkRlYnVnZ2VyTW9kZSIsIlNUT1BQRUQiLCJlZGl0b3JFbGVtZW50IiwiYXRvbSIsInZpZXdzIiwiZ2V0VmlldyIsImFkZEV2ZW50TGlzdGVuZXIiLCJyZW1vdmVFdmVudExpc3RlbmVyIiwiZ3V0dGVyVmlldyIsImJvdW5kQ2xpY2tIYW5kbGVyIiwiX2hhbmRsZUd1dHRlckNsaWNrIiwiYm91bmRNb3VzZU1vdmVIYW5kbGVyIiwiX2hhbmRsZUd1dHRlck1vdXNlTW92ZSIsImJvdW5kTW91c2VFbnRlckhhbmRsZXIiLCJfaGFuZGxlR3V0dGVyTW91c2VFbnRlciIsImJvdW5kTW91c2VMZWF2ZUhhbmRsZXIiLCJfaGFuZGxlR3V0dGVyTW91c2VMZWF2ZSIsImFkZCIsIndpbmRvdyIsImV2ZW50IiwiYnV0dG9uIiwicHJldmVudERlZmF1bHQiLCJzdG9wUHJvcGFnYXRpb24iLCJtZW51VGVtcGxhdGUiLCJjb250ZXh0TWVudSIsInRlbXBsYXRlRm9yRXZlbnQiLCJkZWJ1Z2dlckdyb3VwSW5kZXgiLCJmaW5kSW5kZXgiLCJpdGVtIiwibGFiZWwiLCJkZWJ1Z2dlckdyb3VwIiwic3BsaWNlIiwidW5zaGlmdCIsInN1Ym1lbnUiLCJ0eXBlIiwiZGlzcG9zZSIsImZvckVhY2giLCJtYXJrZXIiLCJkZXN0cm95IiwiZ2V0RWRpdG9yIiwiaGFuZGxlVGV4dEVkaXRvckRlc3Ryb3llZCIsIl9uZWVkc1VwZGF0ZSIsImxpbmUiLCJicCIsImluZm8iLCJnZXQiLCJlbmFibGVkIiwicmVzb2x2ZWQiLCJ2ZXJpZmllZCIsImNvbmRpdGlvbmFsIiwiY29uZGl0aW9uIiwiX2dldExpbmVGb3JCcCIsImRlYnVnZ2luZyIsInBhdGgiLCJnZXRQYXRoIiwiYWxsQnJlYWtwb2ludHMiLCJnZXRCcmVha3BvaW50cyIsImJyZWFrcG9pbnRzIiwiZmlsdGVyIiwidXJpIiwibGluZU1hcCIsIm1hcCIsInVuaGFuZGxlZExpbmVzIiwiU2V0Iiwia2V5cyIsIm1hcmtlcnNUb0tlZXAiLCJnZXRTdGFydEJ1ZmZlclBvc2l0aW9uIiwicm93IiwiaGFzIiwicHVzaCIsImRlbGV0ZSIsImZpbGVMZW5ndGgiLCJnZXRMaW5lQ291bnQiLCJicmVha3BvaW50IiwicmVtb3ZlQnJlYWtwb2ludHMiLCJnZXRJZCIsIl9jcmVhdGVCcmVha3BvaW50TWFya2VyQXRMaW5lIiwic2V0Iiwib25EaWRDaGFuZ2UiLCJfaGFuZGxlTWFya2VyQ2hhbmdlIiwic2hvdyIsImxlbmd0aCIsImlzVmFsaWQiLCJvbGRIZWFkQnVmZmVyUG9zaXRpb24iLCJuZXdIZWFkQnVmZmVyUG9zaXRpb24iLCJuZXdCcCIsImlkIiwiY29sdW1uIiwidXBkYXRlQnJlYWtwb2ludHMiLCJ0YXJnZXQiLCJjbGFzc0xpc3QiLCJjb250YWlucyIsImN1ckxpbmUiLCJfZ2V0Q3VycmVudE1vdXNlRXZlbnRMaW5lIiwidG9nZ2xlU291cmNlQnJlYWtwb2ludCIsImdldEJyZWFrcG9pbnRBdExpbmUiLCJmZWF0dXJlQ29uZmlnIiwiY29tbWFuZHMiLCJkaXNwYXRjaCIsIndvcmtzcGFjZSIsInNob3dPbmx5SWZIaWRkZW4iLCJlIiwiYnVmZmVyUG9zIiwiX2lzTGluZU92ZXJMYXN0U2hhZG93QnJlYWtwb2ludCIsIl9yZW1vdmVMYXN0U2hhZG93QnJlYWtwb2ludCIsIl9jcmVhdGVTaGFkb3dCcmVha3BvaW50QXRMaW5lIiwidmlldyIsInJlY3QiLCJnZXRCb3VuZGluZ0NsaWVudFJlY3QiLCJjbGllbnRYIiwibGVmdCIsInJpZ2h0IiwiY2xpZW50WSIsInRvcCIsImJvdHRvbSIsInNoYWRvd0JyZWFrcG9pbnRNYXJrZXIiLCJicmVha3BvaW50c0F0TGluZSIsImlzU2hhZG93IiwibWFya0J1ZmZlclBvc2l0aW9uIiwiaW52YWxpZGF0ZSIsInVucmVzb2x2ZWQiLCJlbGVtIiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwiZGF0YXNldCIsInRvU3RyaW5nIiwiYnBJZCIsImNsYXNzTmFtZSIsInRpdGxlIiwiZGVjb3JhdGVNYXJrZXIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFD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QUFDTyxLQUFMLElBQWUsZ0JBQWU5RSxTQUFTLElBQUksRUFBRyxHQUE5QztBQUNEO0FBQ0Y7O0FBRUQseUJBQVUsS0FBSzFGLE9BQUwsSUFBZ0IsSUFBMUI7O0FBQ0EsU0FBS0EsT0FBTCxDQUFheUssY0FBYixDQUE0QjVGLE1BQTVCLEVBQW9DO0FBQUVULE1BQUFBLElBQUksRUFBRTZGO0FBQVIsS0FBcEM7O0FBQ0EsV0FBT3BGLE1BQVA7QUFDRDs7QUFuYThDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBJQnJlYWtwb2ludCwgSURlYnVnU2VydmljZSwgSVVJQnJlYWtwb2ludCB9IGZyb20gXCIuL3R5cGVzXCJcclxuXHJcbmltcG9ydCBpbnZhcmlhbnQgZnJvbSBcImFzc2VydFwiXHJcbmltcG9ydCB7IGJ1ZmZlclBvc2l0aW9uRm9yTW91c2VFdmVudCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy1hdG9tL21vdXNlLXRvLXBvc2l0aW9uXCJcclxuaW1wb3J0IHsgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9ldmVudFwiXHJcbmltcG9ydCB7IGZhc3REZWJvdW5jZSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9vYnNlcnZhYmxlXCJcclxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxyXG5pbXBvcnQgeyBzaG93TWVudUZvckV2ZW50IH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLWF0b20vQ29udGV4dE1lbnVcIlxyXG5pbXBvcnQgY2xhc3NuYW1lcyBmcm9tIFwiY2xhc3NuYW1lc1wiXHJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqcy1jb21wYXQvYnVuZGxlcy9yeGpzLWNvbXBhdC51bWQubWluLmpzXCJcclxuaW1wb3J0IHsgRGVidWdnZXJNb2RlIH0gZnJvbSBcIi4vY29uc3RhbnRzXCJcclxuaW1wb3J0IGZlYXR1cmVDb25maWcgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLWF0b20vZmVhdHVyZS1jb25maWdcIlxyXG5cclxuLyoqXHJcbiAqIEEgc2luZ2xlIGRlbGVnYXRlIHdoaWNoIGhhbmRsZXMgZXZlbnRzIGZyb20gdGhlIG9iamVjdC5cclxuICpcclxuICogVGhpcyBpcyBzaW1wbGVyIHRoYW4gcmVnaXN0ZXJpbmcgaGFuZGxlcnMgdXNpbmcgZW1pdHRlciBldmVudHMgZGlyZWN0bHksIGFzXHJcbiAqIHRoZXJlJ3MgbGVzcyBtZXNzeSBib29ra2VlcGluZyByZWdhcmRpbmcgbGlmZXRpbWVzIG9mIHRoZSB1bnJlZ2lzdGVyXHJcbiAqIERpc3Bvc2FibGUgb2JqZWN0cy5cclxuICovXHJcbnR5cGUgQnJlYWtwb2ludERpc3BsYXlDb250cm9sbGVyRGVsZWdhdGUgPSB7XHJcbiAgK2hhbmRsZVRleHRFZGl0b3JEZXN0cm95ZWQ6IChjb250cm9sbGVyOiBCcmVha3BvaW50RGlzcGxheUNvbnRyb2xsZXIpID0+IHZvaWQsXHJcbn1cclxuXHJcbnR5cGUgQnJlYWtwb2ludE1hcmtlclByb3BlcnRpZXMgPSB7XHJcbiAgZW5hYmxlZDogYm9vbGVhbixcclxuICByZXNvbHZlZDogYm9vbGVhbixcclxuICBjb25kaXRpb25hbDogYm9vbGVhbixcclxufVxyXG5cclxuLyoqXHJcbiAqIEhhbmRsZXMgZGlzcGxheWluZyBicmVha3BvaW50cyBhbmQgcHJvY2Vzc2luZyBldmVudHMgZm9yIGEgc2luZ2xlIHRleHRcclxuICogZWRpdG9yLlxyXG4gKi9cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQnJlYWtwb2ludERpc3BsYXlDb250cm9sbGVyIHtcclxuICBfc2VydmljZTogSURlYnVnU2VydmljZVxyXG4gIF9kZWxlZ2F0ZTogQnJlYWtwb2ludERpc3BsYXlDb250cm9sbGVyRGVsZWdhdGVcclxuICBfZGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcclxuICBfZWRpdG9yOiBhdG9tJFRleHRFZGl0b3JcclxuICBfZ3V0dGVyOiA/YXRvbSRHdXR0ZXJcclxuICBfbWFya2VyczogQXJyYXk8YXRvbSRNYXJrZXI+XHJcbiAgX21hcmtlckluZm86IE1hcDxudW1iZXIsIEJyZWFrcG9pbnRNYXJrZXJQcm9wZXJ0aWVzPlxyXG4gIF9sYXN0U2hhZG93QnJlYWtwb2ludE1hcmtlcjogP2F0b20kTWFya2VyXHJcbiAgX2JvdW5kR2xvYmFsTW91c2VNb3ZlSGFuZGxlcjogKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB2b2lkXHJcbiAgX2JvdW5kQ3JlYXRlQ29udGV4dE1lbnVIYW5kbGVyOiAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHZvaWRcclxuICBfZGVidWdnaW5nOiBib29sZWFuXHJcblxyXG4gIGNvbnN0cnVjdG9yKGRlbGVnYXRlOiBCcmVha3BvaW50RGlzcGxheUNvbnRyb2xsZXJEZWxlZ2F0ZSwgc2VydmljZTogSURlYnVnU2VydmljZSwgZWRpdG9yOiBhdG9tJFRleHRFZGl0b3IpIHtcclxuICAgIHRoaXMuX2RlbGVnYXRlID0gZGVsZWdhdGVcclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxyXG4gICAgdGhpcy5fc2VydmljZSA9IHNlcnZpY2VcclxuICAgIHRoaXMuX2VkaXRvciA9IGVkaXRvclxyXG4gICAgdGhpcy5fbWFya2VycyA9IFtdXHJcbiAgICB0aGlzLl9tYXJrZXJJbmZvID0gbmV3IE1hcCgpXHJcbiAgICB0aGlzLl9sYXN0U2hhZG93QnJlYWtwb2ludE1hcmtlciA9IG51bGxcclxuICAgIHRoaXMuX2JvdW5kR2xvYmFsTW91c2VNb3ZlSGFuZGxlciA9IHRoaXMuX2hhbmRsZUdsb2JhbE1vdXNlTGVhdmUuYmluZCh0aGlzKVxyXG4gICAgdGhpcy5fYm91bmRDcmVhdGVDb250ZXh0TWVudUhhbmRsZXIgPSB0aGlzLl9oYW5kbGVDcmVhdGVDb250ZXh0TWVudS5iaW5kKHRoaXMpXHJcbiAgICB0aGlzLl9kZWJ1Z2dpbmcgPSB0aGlzLl9pc0RlYnVnZ2luZygpXHJcblxyXG4gICAgLy8gQ29uZmlndXJlIHRoZSBndXR0ZXIuXHJcbiAgICBjb25zdCBndXR0ZXIgPSBlZGl0b3IuYWRkR3V0dGVyKHtcclxuICAgICAgbmFtZTogXCJkZWJ1Z2dlci1icmVha3BvaW50XCIsXHJcbiAgICAgIHZpc2libGU6IGZhbHNlLFxyXG4gICAgICAvLyBQcmlvcml0eSBpcyAtMjAwIGJ5IGRlZmF1bHQgYW5kIDAgaXMgdGhlIGxpbmUgbnVtYmVyXHJcbiAgICAgIHByaW9yaXR5OiAtMTEwMCxcclxuICAgIH0pXHJcbiAgICBjb25zdCBkZWJ1Z2dlck1vZGVsID0gdGhpcy5fc2VydmljZS5nZXRNb2RlbCgpXHJcbiAgICB0aGlzLl9ndXR0ZXIgPSBndXR0ZXJcclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZFVudGlsRGVzdHJveWVkKFxyXG4gICAgICBlZGl0b3IsXHJcbiAgICAgIGd1dHRlci5vbkRpZERlc3Ryb3kodGhpcy5faGFuZGxlR3V0dGVyRGVzdHJveWVkLmJpbmQodGhpcykpLFxyXG4gICAgICBlZGl0b3Iub2JzZXJ2ZUd1dHRlcnModGhpcy5fcmVnaXN0ZXJHdXR0ZXJNb3VzZUhhbmRsZXJzLmJpbmQodGhpcykpLFxyXG4gICAgICBPYnNlcnZhYmxlLm1lcmdlKFxyXG4gICAgICAgIG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24oZGVidWdnZXJNb2RlbC5vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmJpbmQoZGVidWdnZXJNb2RlbCkpLFxyXG4gICAgICAgIG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24odGhpcy5fc2VydmljZS52aWV3TW9kZWwub25EaWRDaGFuZ2VEZWJ1Z2dlckZvY3VzLmJpbmQodGhpcy5fc2VydmljZS52aWV3TW9kZWwpKVxyXG4gICAgICApXHJcbiAgICAgICAgLy8gRGVib3VuY2UgdG8gYWNjb3VudCBmb3IgYnVsayB1cGRhdGVzIGFuZCBub3QgYmxvY2sgdGhlIFVJXHJcbiAgICAgICAgLmxldChmYXN0RGVib3VuY2UoMTApKVxyXG4gICAgICAgIC5zdGFydFdpdGgobnVsbClcclxuICAgICAgICAuc3Vic2NyaWJlKHRoaXMuX3VwZGF0ZS5iaW5kKHRoaXMpKSxcclxuICAgICAgdGhpcy5fZWRpdG9yLm9uRGlkRGVzdHJveSh0aGlzLl9oYW5kbGVUZXh0RWRpdG9yRGVzdHJveWVkLmJpbmQodGhpcykpLFxyXG4gICAgICB0aGlzLl9yZWdpc3RlckVkaXRvckNvbnRleHRNZW51SGFuZGxlcigpXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBfaXNEZWJ1Z2dpbmcoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5fc2VydmljZVxyXG4gICAgICAuZ2V0TW9kZWwoKVxyXG4gICAgICAuZ2V0UHJvY2Vzc2VzKClcclxuICAgICAgLnNvbWUoKHByb2Nlc3MpID0+IHByb2Nlc3MuZGVidWdnZXJNb2RlICE9PSBEZWJ1Z2dlck1vZGUuU1RPUFBFRClcclxuICB9XHJcblxyXG4gIF9yZWdpc3RlckVkaXRvckNvbnRleHRNZW51SGFuZGxlcigpOiBJRGlzcG9zYWJsZSB7XHJcbiAgICBjb25zdCBlZGl0b3JFbGVtZW50ID0gYXRvbS52aWV3cy5nZXRWaWV3KHRoaXMuX2VkaXRvcilcclxuICAgIGVkaXRvckVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNvbnRleHRtZW51XCIsIHRoaXMuX2JvdW5kQ3JlYXRlQ29udGV4dE1lbnVIYW5kbGVyKVxyXG4gICAgcmV0dXJuIG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKCgpID0+XHJcbiAgICAgIGVkaXRvckVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNvbnRleHRtZW51XCIsIHRoaXMuX2JvdW5kQ3JlYXRlQ29udGV4dE1lbnVIYW5kbGVyKVxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgX3JlZ2lzdGVyR3V0dGVyTW91c2VIYW5kbGVycyhndXR0ZXI6IGF0b20kR3V0dGVyKTogdm9pZCB7XHJcbiAgICBjb25zdCBndXR0ZXJWaWV3ID0gYXRvbS52aWV3cy5nZXRWaWV3KGd1dHRlcilcclxuICAgIGlmIChndXR0ZXIubmFtZSAhPT0gXCJsaW5lLW51bWJlclwiICYmIGd1dHRlci5uYW1lICE9PSBcImRlYnVnZ2VyLWJyZWFrcG9pbnRcIikge1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGNvbnN0IGJvdW5kQ2xpY2tIYW5kbGVyID0gdGhpcy5faGFuZGxlR3V0dGVyQ2xpY2suYmluZCh0aGlzKVxyXG4gICAgY29uc3QgYm91bmRNb3VzZU1vdmVIYW5kbGVyID0gdGhpcy5faGFuZGxlR3V0dGVyTW91c2VNb3ZlLmJpbmQodGhpcylcclxuICAgIGNvbnN0IGJvdW5kTW91c2VFbnRlckhhbmRsZXIgPSB0aGlzLl9oYW5kbGVHdXR0ZXJNb3VzZUVudGVyLmJpbmQodGhpcylcclxuICAgIGNvbnN0IGJvdW5kTW91c2VMZWF2ZUhhbmRsZXIgPSB0aGlzLl9oYW5kbGVHdXR0ZXJNb3VzZUxlYXZlLmJpbmQodGhpcylcclxuICAgIC8vIEFkZCBtb3VzZSBsaXN0ZW5lcnMgZ3V0dGVyIGZvciBzZXR0aW5nIGJyZWFrcG9pbnRzLlxyXG4gICAgZ3V0dGVyVmlldy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYm91bmRDbGlja0hhbmRsZXIpXHJcbiAgICBndXR0ZXJWaWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgYm91bmRNb3VzZU1vdmVIYW5kbGVyKVxyXG4gICAgZ3V0dGVyVmlldy5hZGRFdmVudExpc3RlbmVyKFwibW91c2VlbnRlclwiLCBib3VuZE1vdXNlRW50ZXJIYW5kbGVyKVxyXG4gICAgZ3V0dGVyVmlldy5hZGRFdmVudExpc3RlbmVyKFwibW91c2VsZWF2ZVwiLCBib3VuZE1vdXNlTGVhdmVIYW5kbGVyKVxyXG4gICAgZ3V0dGVyVmlldy5hZGRFdmVudExpc3RlbmVyKFwiY29udGV4dG1lbnVcIiwgdGhpcy5fYm91bmRDcmVhdGVDb250ZXh0TWVudUhhbmRsZXIpXHJcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoXHJcbiAgICAgICgpID0+IGd1dHRlclZpZXcucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGJvdW5kQ2xpY2tIYW5kbGVyKSxcclxuICAgICAgKCkgPT4gZ3V0dGVyVmlldy5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIGJvdW5kTW91c2VNb3ZlSGFuZGxlciksXHJcbiAgICAgICgpID0+IGd1dHRlclZpZXcucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNlZW50ZXJcIiwgYm91bmRNb3VzZUVudGVySGFuZGxlciksXHJcbiAgICAgICgpID0+IGd1dHRlclZpZXcucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNlbGVhdmVcIiwgYm91bmRNb3VzZUxlYXZlSGFuZGxlciksXHJcbiAgICAgICgpID0+IGd1dHRlclZpZXcucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNvbnRleHRtZW51XCIsIHRoaXMuX2JvdW5kQ3JlYXRlQ29udGV4dE1lbnVIYW5kbGVyKSxcclxuICAgICAgKCkgPT4gd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgdGhpcy5fYm91bmRHbG9iYWxNb3VzZU1vdmVIYW5kbGVyKVxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgX2hhbmRsZUNyZWF0ZUNvbnRleHRNZW51KGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XHJcbiAgICBpZiAoZXZlbnQuYnV0dG9uICE9PSAyIHx8ICF0aGlzLl9pc0RlYnVnZ2luZygpKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcclxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXHJcblxyXG4gICAgY29uc3QgbWVudVRlbXBsYXRlID0gYXRvbS5jb250ZXh0TWVudS50ZW1wbGF0ZUZvckV2ZW50KGV2ZW50KVxyXG4gICAgY29uc3QgZGVidWdnZXJHcm91cEluZGV4ID0gbWVudVRlbXBsYXRlLmZpbmRJbmRleCgoaXRlbSkgPT4gaXRlbS5sYWJlbCA9PT0gXCJEZWJ1Z2dlclwiKVxyXG4gICAgY29uc3QgW2RlYnVnZ2VyR3JvdXBdID0gbWVudVRlbXBsYXRlLnNwbGljZShkZWJ1Z2dlckdyb3VwSW5kZXgsIDEpXHJcbiAgICBtZW51VGVtcGxhdGUudW5zaGlmdCguLi5kZWJ1Z2dlckdyb3VwLnN1Ym1lbnUsIHsgdHlwZTogXCJzZXBhcmF0b3JcIiB9KVxyXG4gICAgc2hvd01lbnVGb3JFdmVudChldmVudCwgbWVudVRlbXBsYXRlKVxyXG4gIH1cclxuXHJcbiAgZGlzcG9zZSgpIHtcclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxyXG4gICAgdGhpcy5fbWFya2Vycy5mb3JFYWNoKChtYXJrZXIpID0+IG1hcmtlci5kZXN0cm95KCkpXHJcbiAgICBpZiAodGhpcy5fZ3V0dGVyKSB7XHJcbiAgICAgIHRoaXMuX2d1dHRlci5kZXN0cm95KClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGdldEVkaXRvcigpOiBhdG9tJFRleHRFZGl0b3Ige1xyXG4gICAgcmV0dXJuIHRoaXMuX2VkaXRvclxyXG4gIH1cclxuXHJcbiAgX2hhbmRsZVRleHRFZGl0b3JEZXN0cm95ZWQoKSB7XHJcbiAgICAvLyBHdXR0ZXIuZGVzdHJveSBzZWVtcyB0byBmYWlsIGFmdGVyIHRleHQgZWRpdG9yIGlzIGRlc3Ryb3llZCwgYW5kXHJcbiAgICAvLyBHdXR0ZXIub25EaWREZXN0cm95IGRvZXNuJ3Qgc2VlbSB0byBiZSBjYWxsZWQgaW4gdGhhdCBjYXNlLlxyXG4gICAgdGhpcy5fZ3V0dGVyID0gbnVsbFxyXG4gICAgdGhpcy5fZGVsZWdhdGUuaGFuZGxlVGV4dEVkaXRvckRlc3Ryb3llZCh0aGlzKVxyXG4gIH1cclxuXHJcbiAgX2hhbmRsZUd1dHRlckRlc3Ryb3llZCgpIHtcclxuICAgIC8vIElmIGd1dHRlciBpcyBkZXN0cm95ZWQgYnkgc29tZSBvdXRzaWRlIGZvcmNlLCBlbnN1cmUgdGhlIGd1dHRlciBpcyBub3RcclxuICAgIC8vIGRlc3Ryb3llZCBhZ2Fpbi5cclxuICAgIHRoaXMuX2d1dHRlciA9IG51bGxcclxuICB9XHJcblxyXG4gIF9uZWVkc1VwZGF0ZShsaW5lOiBudW1iZXIsIGJwOiA/SUJyZWFrcG9pbnQpOiBib29sZWFuIHtcclxuICAgIC8vIENoZWNrcyBpZiBhbiBleGlzdGluZyBtYXJrZXIgbm8gbG9uZ2VyIG1hdGNoZXMgdGhlIHByb3BlcnRpZXMgb2YgdGhlIGJyZWFrcG9pbnRcclxuICAgIC8vIGl0IGNvcnJlc3BvbmRzIHRvLlxyXG4gICAgaWYgKGJwID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuIHRydWVcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBpbmZvID0gdGhpcy5fbWFya2VySW5mby5nZXQobGluZSlcclxuICAgIGlmIChpbmZvID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuIHRydWVcclxuICAgIH1cclxuXHJcbiAgICBpZiAoaW5mby5lbmFibGVkICE9PSBicC5lbmFibGVkIHx8IGluZm8ucmVzb2x2ZWQgIT09IGJwLnZlcmlmaWVkIHx8IGluZm8uY29uZGl0aW9uYWwgIT09IChicC5jb25kaXRpb24gIT0gbnVsbCkpIHtcclxuICAgICAgcmV0dXJuIHRydWVcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZmFsc2VcclxuICB9XHJcblxyXG4gIF9nZXRMaW5lRm9yQnAoYnA6IElCcmVha3BvaW50KTogbnVtYmVyIHtcclxuICAgIC8vIFplcm8tYmFzZWQgYnJlYWtwb2ludHMgbGluZSBtYXAgKHRvIG1hdGNoIFVJIG1hcmtlcnMpLlxyXG4gICAgcmV0dXJuIGJwLmxpbmUgLSAxXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBVcGRhdGUgdGhlIGRpc3BsYXkgd2l0aCB0aGUgY3VycmVudCBzZXQgb2YgYnJlYWtwb2ludHMgZm9yIHRoaXMgZWRpdG9yLlxyXG4gICAqL1xyXG4gIF91cGRhdGUoKTogdm9pZCB7XHJcbiAgICBjb25zdCBndXR0ZXIgPSB0aGlzLl9ndXR0ZXJcclxuICAgIGlmIChndXR0ZXIgPT0gbnVsbCkge1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkZWJ1Z2dpbmcgPSB0aGlzLl9pc0RlYnVnZ2luZygpXHJcblxyXG4gICAgY29uc3QgcGF0aCA9IHRoaXMuX2VkaXRvci5nZXRQYXRoKClcclxuICAgIGlmIChwYXRoID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICBjb25zdCBhbGxCcmVha3BvaW50cyA9IHRoaXMuX3NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cygpXHJcbiAgICBjb25zdCBicmVha3BvaW50cyA9IGFsbEJyZWFrcG9pbnRzLmZpbHRlcigoYnApID0+IGJwLnVyaSA9PT0gcGF0aClcclxuICAgIGNvbnN0IGxpbmVNYXAgPSBuZXcgTWFwKGJyZWFrcG9pbnRzLm1hcCgoYnApID0+IFt0aGlzLl9nZXRMaW5lRm9yQnAoYnApLCBicF0pKVxyXG5cclxuICAgIC8vIEEgbXV0YWJsZSB1bmhhbmRsZWQgbGluZXMgbWFwLlxyXG4gICAgY29uc3QgdW5oYW5kbGVkTGluZXMgPSBuZXcgU2V0KGxpbmVNYXAua2V5cygpKVxyXG4gICAgY29uc3QgbWFya2Vyc1RvS2VlcCA9IFtdXHJcblxyXG4gICAgLy8gRGVzdHJveSBtYXJrZXJzIHRoYXQgbm8gbG9uZ2VyIGNvcnJlc3BvbmQgdG8gYnJlYWtwb2ludHMuXHJcbiAgICB0aGlzLl9tYXJrZXJzLmZvckVhY2goKG1hcmtlcikgPT4ge1xyXG4gICAgICBjb25zdCBsaW5lID0gbWFya2VyLmdldFN0YXJ0QnVmZmVyUG9zaXRpb24oKS5yb3dcclxuICAgICAgY29uc3QgYnAgPSBsaW5lTWFwLmdldChsaW5lKVxyXG4gICAgICBpZiAoZGVidWdnaW5nID09PSB0aGlzLl9kZWJ1Z2dpbmcgJiYgdW5oYW5kbGVkTGluZXMuaGFzKGxpbmUpICYmICF0aGlzLl9uZWVkc1VwZGF0ZShsaW5lLCBicCkpIHtcclxuICAgICAgICBtYXJrZXJzVG9LZWVwLnB1c2gobWFya2VyKVxyXG4gICAgICAgIHVuaGFuZGxlZExpbmVzLmRlbGV0ZShsaW5lKVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMuX21hcmtlckluZm8uZGVsZXRlKGxpbmUpXHJcbiAgICAgICAgbWFya2VyLmRlc3Ryb3koKVxyXG4gICAgICB9XHJcbiAgICB9KVxyXG5cclxuICAgIHRoaXMuX2RlYnVnZ2luZyA9IGRlYnVnZ2luZ1xyXG5cclxuICAgIGNvbnN0IGZpbGVMZW5ndGggPSB0aGlzLl9lZGl0b3IuZ2V0TGluZUNvdW50KClcclxuXHJcbiAgICAvLyBBZGQgbmV3IG1hcmtlcnMgZm9yIGJyZWFrcG9pbnRzIHdpdGhvdXQgY29ycmVzcG9uZGluZyBtYXJrZXJzLlxyXG4gICAgZm9yIChjb25zdCBbbGluZSwgYnJlYWtwb2ludF0gb2YgbGluZU1hcCkge1xyXG4gICAgICAvLyBSZW1vdmUgYW55IGJyZWFrcG9pbnRzIHRoYXQgYXJlIHBhc3QgdGhlIGVuZCBvZiB0aGUgZmlsZS5cclxuICAgICAgaWYgKGxpbmUgPj0gZmlsZUxlbmd0aCkge1xyXG4gICAgICAgIHRoaXMuX3NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnJlYWtwb2ludC5nZXRJZCgpKVxyXG4gICAgICAgIGNvbnRpbnVlXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmICghdW5oYW5kbGVkTGluZXMuaGFzKGxpbmUpKSB7XHJcbiAgICAgICAgLy8gVGhpcyBsaW5lIGhhcyBiZWVuIGhhbmRsZWQuXHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG4gICAgICBjb25zdCBtYXJrZXIgPSB0aGlzLl9jcmVhdGVCcmVha3BvaW50TWFya2VyQXRMaW5lKFxyXG4gICAgICAgIGxpbmUsXHJcbiAgICAgICAgZmFsc2UsIC8vIGlzU2hhZG93XHJcbiAgICAgICAgYnJlYWtwb2ludFxyXG4gICAgICApXHJcblxyXG4gICAgICAvLyBSZW1lbWJlciB0aGUgcHJvcGVydGllcyBvZiB0aGUgbWFya2VyIGF0IHRoaXMgbGluZSBzbyBpdCdzIGVhc3kgdG8gdGVsbCBpZiBpdFxyXG4gICAgICAvLyBuZWVkcyB0byBiZSB1cGRhdGVkIHdoZW4gdGhlIGJyZWFrcG9pbnQgcHJvcGVydGllcyBjaGFuZ2UuXHJcbiAgICAgIHRoaXMuX21hcmtlckluZm8uc2V0KGxpbmUsIHtcclxuICAgICAgICBlbmFibGVkOiBicmVha3BvaW50LmVuYWJsZWQsXHJcbiAgICAgICAgcmVzb2x2ZWQ6IGJyZWFrcG9pbnQudmVyaWZpZWQsXHJcbiAgICAgICAgY29uZGl0aW9uYWw6IGJyZWFrcG9pbnQuY29uZGl0aW9uICE9IG51bGwsXHJcbiAgICAgIH0pXHJcbiAgICAgIG1hcmtlci5vbkRpZENoYW5nZSh0aGlzLl9oYW5kbGVNYXJrZXJDaGFuZ2UuYmluZCh0aGlzLCBicmVha3BvaW50KSlcclxuICAgICAgbWFya2Vyc1RvS2VlcC5wdXNoKG1hcmtlcilcclxuICAgIH1cclxuXHJcbiAgICBndXR0ZXIuc2hvdygpXHJcbiAgICB0aGlzLl9tYXJrZXJzID0gbWFya2Vyc1RvS2VlcFxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSGFuZGxlciBmb3IgbWFya2VyIG1vdmVtZW50cyBkdWUgdG8gdGV4dCBiZWluZyBlZGl0ZWQuXHJcbiAgICovXHJcbiAgX2hhbmRsZU1hcmtlckNoYW5nZShicmVha3BvaW50OiBJQnJlYWtwb2ludCwgZXZlbnQ6IGF0b20kTWFya2VyQ2hhbmdlRXZlbnQpOiB2b2lkIHtcclxuICAgIGNvbnN0IHBhdGggPSB0aGlzLl9lZGl0b3IuZ2V0UGF0aCgpXHJcbiAgICBpZiAocGF0aCA9PSBudWxsIHx8IHBhdGgubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gICAgaWYgKCFldmVudC5pc1ZhbGlkKSB7XHJcbiAgICAgIHRoaXMuX3NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnJlYWtwb2ludC5nZXRJZCgpKVxyXG4gICAgfSBlbHNlIGlmIChldmVudC5vbGRIZWFkQnVmZmVyUG9zaXRpb24ucm93ICE9PSBldmVudC5uZXdIZWFkQnVmZmVyUG9zaXRpb24ucm93KSB7XHJcbiAgICAgIGNvbnN0IG5ld0JwOiBJVUlCcmVha3BvaW50ID0ge1xyXG4gICAgICAgIC8vIFZTUCBpcyAxLWJhc2VkIGxpbmUgbnVtYmVycy5cclxuICAgICAgICBsaW5lOiBldmVudC5uZXdIZWFkQnVmZmVyUG9zaXRpb24ucm93ICsgMSxcclxuICAgICAgICBpZDogYnJlYWtwb2ludC5nZXRJZCgpLFxyXG4gICAgICAgIHVyaTogYnJlYWtwb2ludC51cmksXHJcbiAgICAgICAgY29sdW1uOiAwLFxyXG4gICAgICAgIGVuYWJsZWQ6IGJyZWFrcG9pbnQuZW5hYmxlZCxcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGJyZWFrcG9pbnQuY29uZGl0aW9uICE9IG51bGwpIHtcclxuICAgICAgICBuZXdCcC5jb25kaXRpb24gPSBicmVha3BvaW50LmNvbmRpdGlvblxyXG4gICAgICB9XHJcblxyXG4gICAgICB0aGlzLl9zZXJ2aWNlLnVwZGF0ZUJyZWFrcG9pbnRzKFtuZXdCcF0pXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBfaGFuZGxlR3V0dGVyQ2xpY2soZXZlbnQ6IEV2ZW50KTogdm9pZCB7XHJcbiAgICAvLyBjbGFzc0xpc3QgaXNuJ3QgaW4gdGhlIGRlZnMgb2YgRXZlbnRUYXJnZXQuLi5cclxuICAgIGNvbnN0IHRhcmdldDogSFRNTEVsZW1lbnQgPSAoZXZlbnQudGFyZ2V0OiBhbnkpXHJcbiAgICBpZiAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucyhcImljb24tcmlnaHRcIikpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgcGF0aCA9IHRoaXMuX2VkaXRvci5nZXRQYXRoKClcclxuICAgIC8vIGZsb3dsaW50LW5leHQtbGluZSBza2V0Y2h5LW51bGwtc3RyaW5nOm9mZlxyXG4gICAgaWYgKCFwYXRoKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIC8vIERvbid0IHRvZ2dsZSBhIGJyZWFrcG9pbnQgaWYgdGhlIHVzZXIgY2xpY2tlZCBvbiBzb21ldGhpbmcgaW4gdGhlIGd1dHRlciB0aGF0IGlzIG5vdFxyXG4gICAgLy8gdGhlIGRlYnVnZ2VyLCBzdWNoIGFzIGNsaWNraW5nIG9uIGEgbGluZSBudW1iZXIgdG8gc2VsZWN0IHRoZSBsaW5lLlxyXG4gICAgaWYgKFxyXG4gICAgICAhdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucyhcImRlYnVnZ2VyLXNoYWRvdy1icmVha3BvaW50LWljb25cIikgJiZcclxuICAgICAgIXRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoXCJkZWJ1Z2dlci1icmVha3BvaW50LWljb25cIikgJiZcclxuICAgICAgIXRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoXCJkZWJ1Z2dlci1icmVha3BvaW50LWljb24tZGlzYWJsZWRcIikgJiZcclxuICAgICAgIXRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoXCJkZWJ1Z2dlci1icmVha3BvaW50LWljb24tdW5yZXNvbHZlZFwiKSAmJlxyXG4gICAgICAhdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucyhcImRlYnVnZ2VyLWJyZWFrcG9pbnQtaWNvbi1jb25kaXRpb25hbFwiKVxyXG4gICAgKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGN1ckxpbmUgPSB0aGlzLl9nZXRDdXJyZW50TW91c2VFdmVudExpbmUoZXZlbnQpXHJcbiAgICAgIHRoaXMuX3NlcnZpY2UudG9nZ2xlU291cmNlQnJlYWtwb2ludChwYXRoLCBjdXJMaW5lICsgMSlcclxuXHJcbiAgICAgIGlmICh0aGlzLl9zZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludEF0TGluZShwYXRoLCBjdXJMaW5lICsgMSkgIT0gbnVsbCkge1xyXG4gICAgICAgIC8vIElmIGEgYnJlYWtwb2ludCB3YXMgYWRkZWQgYW5kIHNob3dEZWJ1Z2dlck9uQnBTZXQgY29uZmlnIHNldHRpbmdcclxuICAgICAgICAvLyBpcyB0cnVlLCBzaG93IHRoZSBkZWJ1Z2dlci5cclxuICAgICAgICBpZiAoZmVhdHVyZUNvbmZpZy5nZXQoXCJhdG9tLWlkZS1kZWJ1Z2dlci5zaG93RGVidWdnZXJPbkJwU2V0XCIpKSB7XHJcbiAgICAgICAgICBhdG9tLmNvbW1hbmRzLmRpc3BhdGNoKGF0b20udmlld3MuZ2V0VmlldyhhdG9tLndvcmtzcGFjZSksIFwiZGVidWdnZXI6c2hvd1wiLCB7XHJcbiAgICAgICAgICAgIHNob3dPbmx5SWZIaWRkZW46IHRydWUsXHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICB9XHJcblxyXG4gIF9nZXRDdXJyZW50TW91c2VFdmVudExpbmUoZXZlbnQ6IEV2ZW50KTogbnVtYmVyIHtcclxuICAgIC8vICRGbG93SXNzdWVcclxuICAgIGNvbnN0IGJ1ZmZlclBvcyA9IGJ1ZmZlclBvc2l0aW9uRm9yTW91c2VFdmVudChldmVudCwgdGhpcy5fZWRpdG9yKVxyXG4gICAgcmV0dXJuIGJ1ZmZlclBvcy5yb3dcclxuICB9XHJcblxyXG4gIF9oYW5kbGVHdXR0ZXJNb3VzZU1vdmUoZXZlbnQ6IEV2ZW50KTogdm9pZCB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjdXJMaW5lID0gdGhpcy5fZ2V0Q3VycmVudE1vdXNlRXZlbnRMaW5lKGV2ZW50KVxyXG4gICAgICBpZiAodGhpcy5faXNMaW5lT3Zlckxhc3RTaGFkb3dCcmVha3BvaW50KGN1ckxpbmUpKSB7XHJcbiAgICAgICAgcmV0dXJuXHJcbiAgICAgIH1cclxuICAgICAgLy8gVXNlciBtb3ZlcyB0byBhIG5ldyBsaW5lIHdlIG5lZWQgdG8gZGVsZXRlIHRoZSBvbGQgc2hhZG93IGJyZWFrcG9pbnRcclxuICAgICAgLy8gYW5kIGNyZWF0ZSBhIG5ldyBvbmUuXHJcbiAgICAgIHRoaXMuX3JlbW92ZUxhc3RTaGFkb3dCcmVha3BvaW50KClcclxuICAgICAgdGhpcy5fY3JlYXRlU2hhZG93QnJlYWtwb2ludEF0TGluZSh0aGlzLl9lZGl0b3IsIGN1ckxpbmUpXHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgX2hhbmRsZUd1dHRlck1vdXNlRW50ZXIoZXZlbnQ6IEV2ZW50KTogdm9pZCB7XHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCB0aGlzLl9ib3VuZEdsb2JhbE1vdXNlTW92ZUhhbmRsZXIpXHJcbiAgfVxyXG5cclxuICAvLyBUaGlzIGlzIGEgZ2lhbnQgaGFjayB0byBtYWtlIHN1cmUgdGhhdCB0aGUgYnJlYWtwb2ludCBhY3R1YWxseSBkaXNhcHBlYXJzLlxyXG4gIC8vIFRoZSBpc3N1ZSBpcyB0aGF0IG1vdXNlbGVhdmUgZXZlbnQgaXMgc29tZXRpbWVzIG5vdCB0cmlnZ2VyZWQgb24gdGhlIGd1dHRlclxyXG4gIC8vIEkodmpldXgpIGFuZCBtYXR0aGV3aXRoYW5tIHNwZW50IG11bHRpcGxlIGVudGlyZSBkYXlzIHRyeWluZyB0byBmaWd1cmUgb3V0XHJcbiAgLy8gd2h5IHdpdGhvdXQgc3VjY2Vzcywgc28gdGhpcyBpcyBnb2luZyB0byBoYXZlIHRvIGRvIDooXHJcbiAgX2hhbmRsZUdsb2JhbE1vdXNlTGVhdmUoZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy5fZWRpdG9yKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gICAgY29uc3QgdmlldyA9IGF0b20udmlld3MuZ2V0Vmlldyh0aGlzLl9lZGl0b3IpXHJcbiAgICBjb25zdCByZWN0ID0gdmlldy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxyXG4gICAgaWYgKFxyXG4gICAgICBldmVudC5jbGllbnRYIDwgcmVjdC5sZWZ0IHx8XHJcbiAgICAgIGV2ZW50LmNsaWVudFggPiByZWN0LnJpZ2h0IHx8XHJcbiAgICAgIGV2ZW50LmNsaWVudFkgPCByZWN0LnRvcCB8fFxyXG4gICAgICBldmVudC5jbGllbnRZID4gcmVjdC5ib3R0b21cclxuICAgICkge1xyXG4gICAgICB0aGlzLl9yZW1vdmVMYXN0U2hhZG93QnJlYWtwb2ludCgpXHJcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIHRoaXMuX2JvdW5kR2xvYmFsTW91c2VNb3ZlSGFuZGxlcilcclxuICAgIH1cclxuICB9XHJcblxyXG4gIF9oYW5kbGVHdXR0ZXJNb3VzZUxlYXZlKGV2ZW50OiBFdmVudCk6IHZvaWQge1xyXG4gICAgdGhpcy5fcmVtb3ZlTGFzdFNoYWRvd0JyZWFrcG9pbnQoKVxyXG4gIH1cclxuXHJcbiAgX2lzTGluZU92ZXJMYXN0U2hhZG93QnJlYWtwb2ludChjdXJMaW5lOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IHNoYWRvd0JyZWFrcG9pbnRNYXJrZXIgPSB0aGlzLl9sYXN0U2hhZG93QnJlYWtwb2ludE1hcmtlclxyXG4gICAgcmV0dXJuIHNoYWRvd0JyZWFrcG9pbnRNYXJrZXIgIT0gbnVsbCAmJiBzaGFkb3dCcmVha3BvaW50TWFya2VyLmdldFN0YXJ0QnVmZmVyUG9zaXRpb24oKS5yb3cgPT09IGN1ckxpbmVcclxuICB9XHJcblxyXG4gIF9yZW1vdmVMYXN0U2hhZG93QnJlYWtwb2ludCgpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLl9sYXN0U2hhZG93QnJlYWtwb2ludE1hcmtlciAhPSBudWxsKSB7XHJcbiAgICAgIHRoaXMuX2xhc3RTaGFkb3dCcmVha3BvaW50TWFya2VyLmRlc3Ryb3koKVxyXG4gICAgICB0aGlzLl9sYXN0U2hhZG93QnJlYWtwb2ludE1hcmtlciA9IG51bGxcclxuICAgIH1cclxuICB9XHJcblxyXG4gIF9jcmVhdGVTaGFkb3dCcmVha3BvaW50QXRMaW5lKGVkaXRvcjogVGV4dEVkaXRvciwgbGluZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICBjb25zdCBicmVha3BvaW50c0F0TGluZSA9IHRoaXMuX21hcmtlcnMuZmlsdGVyKChtYXJrZXIpID0+IG1hcmtlci5nZXRTdGFydEJ1ZmZlclBvc2l0aW9uKCkucm93ID09PSBsaW5lKVxyXG5cclxuICAgIC8vIERvbid0IGNyZWF0ZSBhIHNoYWRvdyBicmVha3BvaW50IGF0IGEgbGluZSB0aGF0IGFscmVhZHkgaGFzIGEgYnJlYWtwb2ludC5cclxuICAgIGlmIChicmVha3BvaW50c0F0TGluZS5sZW5ndGggPT09IDApIHtcclxuICAgICAgdGhpcy5fbGFzdFNoYWRvd0JyZWFrcG9pbnRNYXJrZXIgPSB0aGlzLl9jcmVhdGVCcmVha3BvaW50TWFya2VyQXRMaW5lKFxyXG4gICAgICAgIGxpbmUsXHJcbiAgICAgICAgdHJ1ZSwgLy8gaXNTaGFkb3dcclxuICAgICAgICBudWxsXHJcbiAgICAgIClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIF9jcmVhdGVCcmVha3BvaW50TWFya2VyQXRMaW5lKGxpbmU6IG51bWJlciwgaXNTaGFkb3c6IGJvb2xlYW4sIGJyZWFrcG9pbnQ6ID9JQnJlYWtwb2ludCk6IGF0b20kTWFya2VyIHtcclxuICAgIGNvbnN0IGVuYWJsZWQgPSBicmVha3BvaW50ICE9IG51bGwgPyBicmVha3BvaW50LmVuYWJsZWQgOiB0cnVlXHJcbiAgICBjb25zdCByZXNvbHZlZCA9IGJyZWFrcG9pbnQgIT0gbnVsbCA/IGJyZWFrcG9pbnQudmVyaWZpZWQgOiBmYWxzZVxyXG4gICAgY29uc3QgY29uZGl0aW9uID0gYnJlYWtwb2ludCAhPSBudWxsID8gYnJlYWtwb2ludC5jb25kaXRpb24gOiBudWxsXHJcbiAgICBjb25zdCBtYXJrZXIgPSB0aGlzLl9lZGl0b3IubWFya0J1ZmZlclBvc2l0aW9uKFtsaW5lLCAwXSwge1xyXG4gICAgICBpbnZhbGlkYXRlOiBcIm5ldmVyXCIsXHJcbiAgICB9KVxyXG5cclxuICAgIC8vIElmIHRoZSBkZWJ1Z2dlciBpcyBub3QgYXR0YWNoZWQsIGRpc3BsYXkgYWxsIGJyZWFrcG9pbnRzIGFzIHJlc29sdmVkLlxyXG4gICAgLy8gT25jZSB0aGUgZGVidWdnZXIgYXR0YWNoZXMsIGl0IHdpbGwgZGV0ZXJtaW5lIHdoYXQncyBhY3R1YWxseSByZXNvbHZlZCBvciBub3QuXHJcbiAgICBjb25zdCB1bnJlc29sdmVkID0gdGhpcy5fZGVidWdnaW5nICYmICFyZXNvbHZlZFxyXG4gICAgY29uc3QgY29uZGl0aW9uYWwgPSBjb25kaXRpb24gIT0gbnVsbFxyXG4gICAgY29uc3QgZWxlbTogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKVxyXG4gICAgZWxlbS5kYXRhc2V0LmxpbmUgPSBsaW5lLnRvU3RyaW5nKClcclxuXHJcbiAgICBpZiAoYnJlYWtwb2ludCAhPSBudWxsKSB7XHJcbiAgICAgIGVsZW0uZGF0YXNldC5icElkID0gYnJlYWtwb2ludC5nZXRJZCgpXHJcbiAgICB9XHJcblxyXG4gICAgZWxlbS5jbGFzc05hbWUgPSBjbGFzc25hbWVzKHtcclxuICAgICAgXCJkZWJ1Z2dlci1icmVha3BvaW50LWljb25cIjogIWlzU2hhZG93ICYmIGVuYWJsZWQgJiYgIXVucmVzb2x2ZWQsXHJcbiAgICAgIFwiZGVidWdnZXItYnJlYWtwb2ludC1pY29uLWNvbmRpdGlvbmFsXCI6IGNvbmRpdGlvbmFsLFxyXG4gICAgICBcImRlYnVnZ2VyLWJyZWFrcG9pbnQtaWNvbi1ub25jb25kaXRpb25hbFwiOiAhY29uZGl0aW9uYWwsXHJcbiAgICAgIFwiZGVidWdnZXItc2hhZG93LWJyZWFrcG9pbnQtaWNvblwiOiBpc1NoYWRvdyxcclxuICAgICAgXCJkZWJ1Z2dlci1icmVha3BvaW50LWljb24tZGlzYWJsZWRcIjogIWlzU2hhZG93ICYmICFlbmFibGVkLFxyXG4gICAgICBcImRlYnVnZ2VyLWJyZWFrcG9pbnQtaWNvbi11bnJlc29sdmVkXCI6ICFpc1NoYWRvdyAmJiBlbmFibGVkICYmIHVucmVzb2x2ZWQsXHJcbiAgICB9KVxyXG5cclxuICAgIGlmICghaXNTaGFkb3cpIHtcclxuICAgICAgaWYgKCFlbmFibGVkKSB7XHJcbiAgICAgICAgZWxlbS50aXRsZSA9IFwiRGlzYWJsZWQgYnJlYWtwb2ludFwiXHJcbiAgICAgIH0gZWxzZSBpZiAodW5yZXNvbHZlZCkge1xyXG4gICAgICAgIGVsZW0udGl0bGUgPSBcIlVucmVzb2x2ZWQgYnJlYWtwb2ludFwiXHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZWxlbS50aXRsZSA9IFwiQnJlYWtwb2ludFwiXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChjb25kaXRpb25hbCkge1xyXG4gICAgICAgIGVsZW0udGl0bGUgKz0gYCAoQ29uZGl0aW9uOiAke2NvbmRpdGlvbiB8fCBcIlwifSlgXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpbnZhcmlhbnQodGhpcy5fZ3V0dGVyICE9IG51bGwpXHJcbiAgICB0aGlzLl9ndXR0ZXIuZGVjb3JhdGVNYXJrZXIobWFya2VyLCB7IGl0ZW06IGVsZW0gfSlcclxuICAgIHJldHVybiBtYXJrZXJcclxuICB9XHJcbn1cclxuIl19