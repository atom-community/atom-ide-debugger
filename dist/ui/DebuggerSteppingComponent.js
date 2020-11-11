"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _LoadingSpinner = require("@atom-ide-community/nuclide-commons-ui/LoadingSpinner");

var _event = require("@atom-ide-community/nuclide-commons/event");

var _observable = require("@atom-ide-community/nuclide-commons/observable");

var React = _interopRequireWildcard(require("react"));

var _Button = require("@atom-ide-community/nuclide-commons-ui/Button");

var _ButtonGroup = require("@atom-ide-community/nuclide-commons-ui/ButtonGroup");

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

var _constants = require("../constants");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _logger = _interopRequireDefault(require("../logger"));

var _nullthrows = _interopRequireDefault(require("nullthrows"));

var _assert = _interopRequireDefault(require("assert"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

const defaultTooltipOptions = {
  placement: "bottom"
};
const STEP_OVER_ICON = /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 100 100"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "46",
  cy: "63",
  r: "10"
}), /*#__PURE__*/React.createElement("path", {
  d: "M83.8,54.7c-6.5-16.6-20.7-28.1-37.2-28.1c-19.4,0-35.6,16-39.9," + "37.3l11.6,2.9c3-16.2,14.5-28.2,28.2-28.2 c11,0,20.7,7.8,25.6," + "19.3l-9.6,2.7l20.8,14.7L93.7,52L83.8,54.7z"
}));
const STEP_INTO_ICON = /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 100 100"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "50",
  cy: "75",
  r: "10"
}), /*#__PURE__*/React.createElement("polygon", {
  points: "42,20 57,20 57,40 72,40 50,60 28,40 42,40"
}));
const STEP_OUT_ICON = /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 100 100"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "50",
  cy: "75",
  r: "10"
}), /*#__PURE__*/React.createElement("polygon", {
  points: "42,20 57,20 57,40 72,40 50,60 28,40 42,40",
  transform: "rotate(180, 50, 40)"
}));

function SVGButton(props) {
  return /*#__PURE__*/React.createElement(_Button.Button, {
    className: "debugger-stepping-svg-button",
    onClick: props.onClick,
    disabled: props.disabled,
    tooltip: props.tooltip
  }, /*#__PURE__*/React.createElement("div", null, props.icon));
}

class DebuggerSteppingComponent extends React.Component {
  constructor(props) {
    super(props);
    this._disposables = void 0;

    this._togglePauseState = () => {
      const pausableThread = this._getPausableThread();

      if (pausableThread == null) {
        _logger.default.error("No thread to pause/resume");

        return;
      }

      if (pausableThread.stopped) {
        pausableThread.continue();
      } else {
        this._setWaitingForPause(true);

        pausableThread.pause();
      }
    };

    this._disposables = new _UniversalDisposable.default();
    this.state = {
      waitingForPause: false,
      focusedProcess: null,
      focusedThread: null
    };
  }

  componentDidMount() {
    const {
      service
    } = this.props;
    const model = service.getModel();

    this._disposables.add(_rxjsCompatUmdMin.Observable.merge((0, _event.observableFromSubscribeFunction)(service.onDidChangeProcessMode.bind(service)), (0, _event.observableFromSubscribeFunction)(model.onDidChangeCallStack.bind(model)), (0, _event.observableFromSubscribeFunction)(service.viewModel.onDidChangeDebuggerFocus.bind(service.viewModel))).startWith(null).let((0, _observable.fastDebounce)(10)).subscribe(() => {
      const {
        viewModel
      } = this.props.service;
      const {
        focusedProcess,
        focusedThread
      } = viewModel;
      const debuggerMode = focusedProcess == null ? _constants.DebuggerMode.STOPPED : focusedProcess.debuggerMode;
      this.setState(prevState => ({
        focusedProcess,
        focusedThread,
        waitingForPause: prevState.waitingForPause && debuggerMode === _constants.DebuggerMode.RUNNING
      }));
    }));
  }

  componentWillUnmount() {
    this._disposables.dispose();
  }

  _setWaitingForPause(waiting) {
    this.setState({
      waitingForPause: waiting
    });
  }

  _getPausableThread() {
    const {
      focusedThread,
      focusedProcess
    } = this.props.service.viewModel;

    if (focusedThread != null) {
      return focusedThread;
    } else if (focusedProcess != null) {
      return focusedProcess.getAllThreads()[0];
    } else {
      return null;
    }
  }

  render() {
    const {
      waitingForPause,
      focusedProcess,
      focusedThread
    } = this.state;
    const {
      service
    } = this.props;
    const debuggerMode = focusedProcess == null ? _constants.DebuggerMode.STOPPED : focusedProcess.debuggerMode;
    const readOnly = focusedProcess == null ? false : Boolean(focusedProcess.configuration.isReadOnly);
    const customControlButtons = focusedProcess == null ? [] : focusedProcess.configuration.customControlButtons || [];
    const isPaused = debuggerMode === _constants.DebuggerMode.PAUSED;
    const isStopped = debuggerMode === _constants.DebuggerMode.STOPPED;
    const isPausing = debuggerMode === _constants.DebuggerMode.RUNNING && waitingForPause;
    const playPauseIcon = isPausing ? null : /*#__PURE__*/React.createElement("span", {
      className: isPaused ? "icon-playback-play" : "icon-playback-pause"
    });
    const loadingIndicator = !isPausing ? null : /*#__PURE__*/React.createElement(_LoadingSpinner.LoadingSpinner, {
      className: "debugger-stepping-playpause-button-loading",
      size: _LoadingSpinner.LoadingSpinnerSizes.EXTRA_SMALL
    });
    const restartDebuggerButton = debuggerMode !== _constants.DebuggerMode.STOPPED && service.canRestartProcess() ? /*#__PURE__*/React.createElement(_Button.Button, {
      icon: "sync",
      className: "debugger-stepping-button-separated",
      disabled: isStopped || readOnly,
      tooltip: { ...defaultTooltipOptions,
        title: "Restart the debugger using the same settings as the current debug session",
        keyBindingCommand: "debugger:restart-debugging"
      },
      onClick: () => {
        (0, _assert.default)(focusedProcess != null);
        service.restartProcess(focusedProcess);
      }
    }) : null;

    const DebuggerStepButton = props => /*#__PURE__*/React.createElement(SVGButton, {
      icon: props.icon,
      disabled: props.disabled || readOnly,
      tooltip: { ...defaultTooltipOptions,
        title: props.title,
        keyBindingCommand: props.keyBindingCommand
      },
      onClick: props.onClick
    });

    const pausableThread = this._getPausableThread();

    let playPauseTitle;

    if (isPausing) {
      playPauseTitle = "Waiting for pause...";
    } else if (isPaused) {
      playPauseTitle = "Continue";
    } else if (pausableThread == null) {
      playPauseTitle = "No running threads to pause!";
    } else {
      playPauseTitle = "Pause";
    }

    const process = service.getModel().getProcesses()[0];
    const attached = process != null && process.configuration.debugMode === "attach";
    return /*#__PURE__*/React.createElement("div", {
      className: "debugger-stepping-component"
    }, /*#__PURE__*/React.createElement(_ButtonGroup.ButtonGroup, {
      className: "debugger-stepping-buttongroup"
    }, restartDebuggerButton, /*#__PURE__*/React.createElement(_Button.Button, {
      disabled: isPausing || pausableThread == null || readOnly,
      tooltip: { ...defaultTooltipOptions,
        title: playPauseTitle,
        keyBindingCommand: isPaused ? "debugger:continue-debugging" : undefined
      },
      onClick: this._togglePauseState.bind(this)
    }, /*#__PURE__*/React.createElement("div", {
      className: "debugger-stepping-playpause-button"
    }, playPauseIcon, loadingIndicator)), /*#__PURE__*/React.createElement(DebuggerStepButton, {
      icon: STEP_OVER_ICON,
      disabled: !isPaused || focusedThread == null,
      title: "Step over",
      keyBindingCommand: "debugger:step-over",
      onClick: () => (0, _nullthrows.default)(focusedThread).next()
    }), /*#__PURE__*/React.createElement(DebuggerStepButton, {
      icon: STEP_INTO_ICON,
      disabled: !isPaused || focusedThread == null,
      title: "Step into",
      keyBindingCommand: "debugger:step-into",
      onClick: () => (0, _nullthrows.default)(focusedThread).stepIn()
    }), /*#__PURE__*/React.createElement(DebuggerStepButton, {
      icon: STEP_OUT_ICON,
      disabled: !isPaused || focusedThread == null,
      title: "Step out",
      keyBindingCommand: "debugger:step-out",
      onClick: () => (0, _nullthrows.default)(focusedThread).stepOut()
    }), /*#__PURE__*/React.createElement(_Button.Button, {
      icon: "primitive-square",
      disabled: isStopped || focusedProcess == null,
      tooltip: { ...defaultTooltipOptions,
        title: attached ? "Detach" : "Terminate",
        keyBindingCommand: "debugger:stop-debugging"
      },
      onClick: () => {
        if (focusedProcess != null) {
          service.stopProcess(focusedProcess);
        }
      }
    })), /*#__PURE__*/React.createElement(_ButtonGroup.ButtonGroup, {
      className: "debugger-stepping-buttongroup"
    }, customControlButtons.map((specification, i) => {
      const buttonProps = { ...specification,
        tooltip: {
          title: specification.title
        }
      };
      return /*#__PURE__*/React.createElement(_Button.Button, _extends({}, buttonProps, {
        key: i
      }));
    })));
  }

}

exports.default = DebuggerSteppingComponent;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnQuanMiXSwibmFtZXMiOlsiZGVmYXVsdFRvb2x0aXBPcHRpb25zIiwicGxhY2VtZW50IiwiU1RFUF9PVkVSX0lDT04iLCJTVEVQX0lOVE9fSUNPTiIsIlNURVBfT1VUX0lDT04iLCJTVkdCdXR0b24iLCJwcm9wcyIsIm9uQ2xpY2siLCJkaXNhYmxlZCIsInRvb2x0aXAiLCJpY29uIiwiRGVidWdnZXJTdGVwcGluZ0NvbXBvbmVudCIsIlJlYWN0IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJfZGlzcG9zYWJsZXMiLCJfdG9nZ2xlUGF1c2VTdGF0ZSIsInBhdXNhYmxlVGhyZWFkIiwiX2dldFBhdXNhYmxlVGhyZWFkIiwibG9nZ2VyIiwiZXJyb3IiLCJzdG9wcGVkIiwiY29udGludWUiLCJfc2V0V2FpdGluZ0ZvclBhdXNlIiwicGF1c2UiLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwic3RhdGUiLCJ3YWl0aW5nRm9yUGF1c2UiLCJmb2N1c2VkUHJvY2VzcyIsImZvY3VzZWRUaHJlYWQiLCJjb21wb25lbnREaWRNb3VudCIsInNlcnZpY2UiLCJtb2RlbCIsImdldE1vZGVsIiwiYWRkIiwiT2JzZXJ2YWJsZSIsIm1lcmdlIiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsImJpbmQiLCJvbkRpZENoYW5nZUNhbGxTdGFjayIsInZpZXdNb2RlbCIsIm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cyIsInN0YXJ0V2l0aCIsImxldCIsInN1YnNjcmliZSIsImRlYnVnZ2VyTW9kZSIsIkRlYnVnZ2VyTW9kZSIsIlNUT1BQRUQiLCJzZXRTdGF0ZSIsInByZXZTdGF0ZSIsIlJVTk5JTkciLCJjb21wb25lbnRXaWxsVW5tb3VudCIsImRpc3Bvc2UiLCJ3YWl0aW5nIiwiZ2V0QWxsVGhyZWFkcyIsInJlbmRlciIsInJlYWRPbmx5IiwiQm9vbGVhbiIsImNvbmZpZ3VyYXRpb24iLCJpc1JlYWRPbmx5IiwiY3VzdG9tQ29udHJvbEJ1dHRvbnMiLCJpc1BhdXNlZCIsIlBBVVNFRCIsImlzU3RvcHBlZCIsImlzUGF1c2luZyIsInBsYXlQYXVzZUljb24iLCJsb2FkaW5nSW5kaWNhdG9yIiwiTG9hZGluZ1NwaW5uZXJTaXplcyIsIkVYVFJBX1NNQUxMIiwicmVzdGFydERlYnVnZ2VyQnV0dG9uIiwiY2FuUmVzdGFydFByb2Nlc3MiLCJ0aXRsZSIsImtleUJpbmRpbmdDb21tYW5kIiwicmVzdGFydFByb2Nlc3MiLCJEZWJ1Z2dlclN0ZXBCdXR0b24iLCJwbGF5UGF1c2VUaXRsZSIsInByb2Nlc3MiLCJnZXRQcm9jZXNzZXMiLCJhdHRhY2hlZCIsImRlYnVnTW9kZSIsInVuZGVmaW5lZCIsIm5leHQiLCJzdGVwSW4iLCJzdGVwT3V0Iiwic3RvcFByb2Nlc3MiLCJtYXAiLCJzcGVjaWZpY2F0aW9uIiwiaSIsImJ1dHRvblByb3BzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ0E7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFZQSxNQUFNQSxxQkFBcUIsR0FBRztBQUM1QkMsRUFBQUEsU0FBUyxFQUFFO0FBRGlCLENBQTlCO0FBSUEsTUFBTUMsY0FBYyxnQkFDbEI7QUFBSyxFQUFBLE9BQU8sRUFBQztBQUFiLGdCQUNFO0FBQVEsRUFBQSxFQUFFLEVBQUMsSUFBWDtBQUFnQixFQUFBLEVBQUUsRUFBQyxJQUFuQjtBQUF3QixFQUFBLENBQUMsRUFBQztBQUExQixFQURGLGVBRUU7QUFDRSxFQUFBLENBQUMsRUFDQyxtRUFDQSwrREFEQSxHQUVBO0FBSkosRUFGRixDQURGO0FBYUEsTUFBTUMsY0FBYyxnQkFDbEI7QUFBSyxFQUFBLE9BQU8sRUFBQztBQUFiLGdCQUNFO0FBQVEsRUFBQSxFQUFFLEVBQUMsSUFBWDtBQUFnQixFQUFBLEVBQUUsRUFBQyxJQUFuQjtBQUF3QixFQUFBLENBQUMsRUFBQztBQUExQixFQURGLGVBRUU7QUFBUyxFQUFBLE1BQU0s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TUFBTSx5QkFBV0EsYUFBWCxFQUEwQnNELE9BQTFCO0FBTGpCLE1BOUJGLGVBcUNFLG9CQUFDLGNBQUQ7QUFDRSxNQUFBLElBQUksRUFBQyxrQkFEUDtBQUVFLE1BQUEsUUFBUSxFQUFFcEIsU0FBUyxJQUFJbkMsY0FBYyxJQUFJLElBRjNDO0FBR0UsTUFBQSxPQUFPLEVBQUUsRUFDUCxHQUFHNUIscUJBREk7QUFFUHVFLFFBQUFBLEtBQUssRUFBRU8sUUFBUSxHQUFHLFFBQUgsR0FBYyxXQUZ0QjtBQUdQTixRQUFBQSxpQkFBaUIsRUFBRTtBQUhaLE9BSFg7QUFRRSxNQUFBLE9BQU8sRUFBRSxNQUFNO0FBQ2IsWUFBSTVDLGNBQWMsSUFBSSxJQUF0QixFQUE0QjtBQUMxQkcsVUFBQUEsT0FBTyxDQUFDcUQsV0FBUixDQUFvQnhELGNBQXBCO0FBQ0Q7QUFDRjtBQVpILE1BckNGLENBREYsZUFxREUsb0JBQUMsd0JBQUQ7QUFBYSxNQUFBLFNBQVMsRUFBQztBQUF2QixPQUNHZ0Msb0JBQW9CLENBQUN5QixHQUFyQixDQUF5QixDQUFDQyxhQUFELEVBQWdCQyxDQUFoQixLQUFzQjtBQUM5QyxZQUFNQyxXQUFXLEdBQUcsRUFDbEIsR0FBR0YsYUFEZTtBQUVsQjdFLFFBQUFBLE9BQU8sRUFBRTtBQUNQOEQsVUFBQUEsS0FBSyxFQUFFZSxhQUFhLENBQUNmO0FBRGQ7QUFGUyxPQUFwQjtBQU1BLDBCQUFPLG9CQUFDLGNBQUQsZUFBWWlCLFdBQVo7QUFBeUIsUUFBQSxHQUFHLEVBQUVEO0FBQTlCLFNBQVA7QUFDRCxLQVJBLENBREgsQ0FyREYsQ0FERjtBQW1FRDs7QUFyTkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IElEZWJ1Z1NlcnZpY2UsIElUaHJlYWQsIElQcm9jZXNzIH0gZnJvbSBcIi4uL3R5cGVzXCJcclxuaW1wb3J0IHsgTG9hZGluZ1NwaW5uZXIsIExvYWRpbmdTcGlubmVyU2l6ZXMgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvTG9hZGluZ1NwaW5uZXJcIlxyXG5cclxuaW1wb3J0IHsgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9ldmVudFwiXHJcbmltcG9ydCB7IGZhc3REZWJvdW5jZSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9vYnNlcnZhYmxlXCJcclxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcclxuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0J1dHRvblwiXHJcbmltcG9ydCB7IEJ1dHRvbkdyb3VwIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0J1dHRvbkdyb3VwXCJcclxuaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gXCJyeGpzLWNvbXBhdC9idW5kbGVzL3J4anMtY29tcGF0LnVtZC5taW4uanNcIlxyXG5pbXBvcnQgeyBEZWJ1Z2dlck1vZGUgfSBmcm9tIFwiLi4vY29uc3RhbnRzXCJcclxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxyXG5pbXBvcnQgbG9nZ2VyIGZyb20gXCIuLi9sb2dnZXJcIlxyXG5pbXBvcnQgbnVsbHRocm93cyBmcm9tIFwibnVsbHRocm93c1wiXHJcbmltcG9ydCBpbnZhcmlhbnQgZnJvbSBcImFzc2VydFwiXHJcblxyXG50eXBlIERlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnRQcm9wcyA9IHtcclxuICBzZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxyXG59XHJcblxyXG50eXBlIERlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnRTdGF0ZSA9IHtcclxuICB3YWl0aW5nRm9yUGF1c2U6IGJvb2xlYW4sXHJcbiAgZm9jdXNlZFByb2Nlc3M6ID9JUHJvY2VzcyxcclxuICBmb2N1c2VkVGhyZWFkOiA/SVRocmVhZCxcclxufVxyXG5cclxuY29uc3QgZGVmYXVsdFRvb2x0aXBPcHRpb25zID0ge1xyXG4gIHBsYWNlbWVudDogXCJib3R0b21cIixcclxufVxyXG5cclxuY29uc3QgU1RFUF9PVkVSX0lDT04gPSAoXHJcbiAgPHN2ZyB2aWV3Qm94PVwiMCAwIDEwMCAxMDBcIj5cclxuICAgIDxjaXJjbGUgY3g9XCI0NlwiIGN5PVwiNjNcIiByPVwiMTBcIiAvPlxyXG4gICAgPHBhdGhcclxuICAgICAgZD17XHJcbiAgICAgICAgXCJNODMuOCw1NC43Yy02LjUtMTYuNi0yMC43LTI4LjEtMzcuMi0yOC4xYy0xOS40LDAtMzUuNiwxNi0zOS45LFwiICtcclxuICAgICAgICBcIjM3LjNsMTEuNiwyLjljMy0xNi4yLDE0LjUtMjguMiwyOC4yLTI4LjIgYzExLDAsMjAuNyw3LjgsMjUuNixcIiArXHJcbiAgICAgICAgXCIxOS4zbC05LjYsMi43bDIwLjgsMTQuN0w5My43LDUyTDgzLjgsNTQuN3pcIlxyXG4gICAgICB9XHJcbiAgICAvPlxyXG4gIDwvc3ZnPlxyXG4pXHJcblxyXG5jb25zdCBTVEVQX0lOVE9fSUNPTiA9IChcclxuICA8c3ZnIHZpZXdCb3g9XCIwIDAgMTAwIDEwMFwiPlxyXG4gICAgPGNpcmNsZSBjeD1cIjUwXCIgY3k9XCI3NVwiIHI9XCIxMFwiIC8+XHJcbiAgICA8cG9seWdvbiBwb2ludHM9XCI0MiwyMCA1NywyMCA1Nyw0MCA3Miw0MCA1MCw2MCAyOCw0MCA0Miw0MFwiIC8+XHJcbiAgPC9zdmc+XHJcbilcclxuXHJcbmNvbnN0IFNURVBfT1VUX0lDT04gPSAoXHJcbiAgPHN2ZyB2aWV3Qm94PVwiMCAwIDEwMCAxMDBcIj5cclxuICAgIDxjaXJjbGUgY3g9XCI1MFwiIGN5PVwiNzVcIiByPVwiMTBcIiAvPlxyXG4gICAgPHBvbHlnb24gcG9pbnRzPVwiNDIsMjAgNTcsMjAgNTcsNDAgNzIsNDAgNTAsNjAgMjgsNDAgNDIsNDBcIiB0cmFuc2Zvcm09XCJyb3RhdGUoMTgwLCA1MCwgNDApXCIgLz5cclxuICA8L3N2Zz5cclxuKVxyXG5cclxuZnVuY3Rpb24gU1ZHQnV0dG9uKHByb3BzOiB7XHJcbiAgb25DbGljazogKCkgPT4gbWl4ZWQsXHJcbiAgdG9vbHRpcDogYXRvbSRUb29sdGlwc0FkZE9wdGlvbnMsXHJcbiAgaWNvbjogUmVhY3QuRWxlbWVudDxhbnk+LFxyXG4gIGRpc2FibGVkOiBib29sZWFuLFxyXG59KTogUmVhY3QuRWxlbWVudDxhbnk+IHtcclxuICByZXR1cm4gKFxyXG4gICAgPEJ1dHRvblxyXG4gICAgICBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zdGVwcGluZy1zdmctYnV0dG9uXCJcclxuICAgICAgb25DbGljaz17cHJvcHMub25DbGlja31cclxuICAgICAgZGlzYWJsZWQ9e3Byb3BzLmRpc2FibGVkfVxyXG4gICAgICB0b29sdGlwPXtwcm9wcy50b29sdGlwfVxyXG4gICAgPlxyXG4gICAgICA8ZGl2Pntwcm9wcy5pY29ufTwvZGl2PlxyXG4gICAgPC9CdXR0b24+XHJcbiAgKVxyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEZWJ1Z2dlclN0ZXBwaW5nQ29tcG9uZW50IGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50PFxyXG4gIERlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnRQcm9wcyxcclxuICBEZWJ1Z2dlclN0ZXBwaW5nQ29tcG9uZW50U3RhdGVcclxuPiB7XHJcbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXHJcblxyXG4gIGNvbnN0cnVjdG9yKHByb3BzOiBEZWJ1Z2dlclN0ZXBwaW5nQ29tcG9uZW50UHJvcHMpIHtcclxuICAgIHN1cGVyKHByb3BzKVxyXG5cclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxyXG4gICAgdGhpcy5zdGF0ZSA9IHtcclxuICAgICAgd2FpdGluZ0ZvclBhdXNlOiBmYWxzZSxcclxuICAgICAgZm9jdXNlZFByb2Nlc3M6IG51bGwsXHJcbiAgICAgIGZvY3VzZWRUaHJlYWQ6IG51bGwsXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjb21wb25lbnREaWRNb3VudCgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xyXG4gICAgY29uc3QgbW9kZWwgPSBzZXJ2aWNlLmdldE1vZGVsKClcclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcclxuICAgICAgT2JzZXJ2YWJsZS5tZXJnZShcclxuICAgICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHNlcnZpY2Uub25EaWRDaGFuZ2VQcm9jZXNzTW9kZS5iaW5kKHNlcnZpY2UpKSxcclxuICAgICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKG1vZGVsLm9uRGlkQ2hhbmdlQ2FsbFN0YWNrLmJpbmQobW9kZWwpKSxcclxuICAgICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHNlcnZpY2Uudmlld01vZGVsLm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cy5iaW5kKHNlcnZpY2Uudmlld01vZGVsKSlcclxuICAgICAgKVxyXG4gICAgICAgIC5zdGFydFdpdGgobnVsbClcclxuICAgICAgICAubGV0KGZhc3REZWJvdW5jZSgxMCkpXHJcbiAgICAgICAgLnN1YnNjcmliZSgoKSA9PiB7XHJcbiAgICAgICAgICBjb25zdCB7IHZpZXdNb2RlbCB9ID0gdGhpcy5wcm9wcy5zZXJ2aWNlXHJcbiAgICAgICAgICBjb25zdCB7IGZvY3VzZWRQcm9jZXNzLCBmb2N1c2VkVGhyZWFkIH0gPSB2aWV3TW9kZWxcclxuICAgICAgICAgIGNvbnN0IGRlYnVnZ2VyTW9kZSA9IGZvY3VzZWRQcm9jZXNzID09IG51bGwgPyBEZWJ1Z2dlck1vZGUuU1RPUFBFRCA6IGZvY3VzZWRQcm9jZXNzLmRlYnVnZ2VyTW9kZVxyXG5cclxuICAgICAgICAgIHRoaXMuc2V0U3RhdGUoKHByZXZTdGF0ZSkgPT4gKHtcclxuICAgICAgICAgICAgZm9jdXNlZFByb2Nlc3MsXHJcbiAgICAgICAgICAgIGZvY3VzZWRUaHJlYWQsXHJcbiAgICAgICAgICAgIHdhaXRpbmdGb3JQYXVzZTogcHJldlN0YXRlLndhaXRpbmdGb3JQYXVzZSAmJiBkZWJ1Z2dlck1vZGUgPT09IERlYnVnZ2VyTW9kZS5SVU5OSU5HLFxyXG4gICAgICAgICAgfSkpXHJcbiAgICAgICAgfSlcclxuICAgIClcclxuICB9XHJcblxyXG4gIGNvbXBvbmVudFdpbGxVbm1vdW50KCk6IHZvaWQge1xyXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpXHJcbiAgfVxyXG5cclxuICBfc2V0V2FpdGluZ0ZvclBhdXNlKHdhaXRpbmc6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgIHRoaXMuc2V0U3RhdGUoe1xyXG4gICAgICB3YWl0aW5nRm9yUGF1c2U6IHdhaXRpbmcsXHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgX2dldFBhdXNhYmxlVGhyZWFkKCk6ID9JVGhyZWFkIHtcclxuICAgIGNvbnN0IHsgZm9jdXNlZFRocmVhZCwgZm9jdXNlZFByb2Nlc3MgfSA9IHRoaXMucHJvcHMuc2VydmljZS52aWV3TW9kZWxcclxuICAgIGlmIChmb2N1c2VkVGhyZWFkICE9IG51bGwpIHtcclxuICAgICAgcmV0dXJuIGZvY3VzZWRUaHJlYWRcclxuICAgIH0gZWxzZSBpZiAoZm9jdXNlZFByb2Nlc3MgIT0gbnVsbCkge1xyXG4gICAgICByZXR1cm4gZm9jdXNlZFByb2Nlc3MuZ2V0QWxsVGhyZWFkcygpWzBdXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgX3RvZ2dsZVBhdXNlU3RhdGUgPSAoKSA9PiB7XHJcbiAgICBjb25zdCBwYXVzYWJsZVRocmVhZCA9IHRoaXMuX2dldFBhdXNhYmxlVGhyZWFkKClcclxuICAgIGlmIChwYXVzYWJsZVRocmVhZCA9PSBudWxsKSB7XHJcbiAgICAgIGxvZ2dlci5lcnJvcihcIk5vIHRocmVhZCB0byBwYXVzZS9yZXN1bWVcIilcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHBhdXNhYmxlVGhyZWFkLnN0b3BwZWQpIHtcclxuICAgICAgcGF1c2FibGVUaHJlYWQuY29udGludWUoKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5fc2V0V2FpdGluZ0ZvclBhdXNlKHRydWUpXHJcbiAgICAgIHBhdXNhYmxlVGhyZWFkLnBhdXNlKClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJlbmRlcigpOiBSZWFjdC5Ob2RlIHtcclxuICAgIGNvbnN0IHsgd2FpdGluZ0ZvclBhdXNlLCBmb2N1c2VkUHJvY2VzcywgZm9jdXNlZFRocmVhZCB9ID0gdGhpcy5zdGF0ZVxyXG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXHJcbiAgICBjb25zdCBkZWJ1Z2dlck1vZGUgPSBmb2N1c2VkUHJvY2VzcyA9PSBudWxsID8gRGVidWdnZXJNb2RlLlNUT1BQRUQgOiBmb2N1c2VkUHJvY2Vzcy5kZWJ1Z2dlck1vZGVcclxuICAgIGNvbnN0IHJlYWRPbmx5ID0gZm9jdXNlZFByb2Nlc3MgPT0gbnVsbCA/IGZhbHNlIDogQm9vbGVhbihmb2N1c2VkUHJvY2Vzcy5jb25maWd1cmF0aW9uLmlzUmVhZE9ubHkpXHJcbiAgICBjb25zdCBjdXN0b21Db250cm9sQnV0dG9ucyA9IGZvY3VzZWRQcm9jZXNzID09IG51bGwgPyBbXSA6IGZvY3VzZWRQcm9jZXNzLmNvbmZpZ3VyYXRpb24uY3VzdG9tQ29udHJvbEJ1dHRvbnMgfHwgW11cclxuICAgIGNvbnN0IGlzUGF1c2VkID0gZGVidWdnZXJNb2RlID09PSBEZWJ1Z2dlck1vZGUuUEFVU0VEXHJcbiAgICBjb25zdCBpc1N0b3BwZWQgPSBkZWJ1Z2dlck1vZGUgPT09IERlYnVnZ2VyTW9kZS5TVE9QUEVEXHJcbiAgICBjb25zdCBpc1BhdXNpbmcgPSBkZWJ1Z2dlck1vZGUgPT09IERlYnVnZ2VyTW9kZS5SVU5OSU5HICYmIHdhaXRpbmdGb3JQYXVzZVxyXG4gICAgY29uc3QgcGxheVBhdXNlSWNvbiA9IGlzUGF1c2luZyA/IG51bGwgOiAoXHJcbiAgICAgIDxzcGFuIGNsYXNzTmFtZT17aXNQYXVzZWQgPyBcImljb24tcGxheWJhY2stcGxheVwiIDogXCJpY29uLXBsYXliYWNrLXBhdXNlXCJ9IC8+XHJcbiAgICApXHJcblxyXG4gICAgY29uc3QgbG9hZGluZ0luZGljYXRvciA9ICFpc1BhdXNpbmcgPyBudWxsIDogKFxyXG4gICAgICA8TG9hZGluZ1NwaW5uZXIgY2xhc3NOYW1lPVwiZGVidWdnZXItc3RlcHBpbmctcGxheXBhdXNlLWJ1dHRvbi1sb2FkaW5nXCIgc2l6ZT17TG9hZGluZ1NwaW5uZXJTaXplcy5FWFRSQV9TTUFMTH0gLz5cclxuICAgIClcclxuXHJcbiAgICBjb25zdCByZXN0YXJ0RGVidWdnZXJCdXR0b24gPVxyXG4gICAgICBkZWJ1Z2dlck1vZGUgIT09IERlYnVnZ2VyTW9kZS5TVE9QUEVEICYmIHNlcnZpY2UuY2FuUmVzdGFydFByb2Nlc3MoKSA/IChcclxuICAgICAgICA8QnV0dG9uXHJcbiAgICAgICAgICBpY29uPVwic3luY1wiXHJcbiAgICAgICAgICBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zdGVwcGluZy1idXR0b24tc2VwYXJhdGVkXCJcclxuICAgICAgICAgIGRpc2FibGVkPXtpc1N0b3BwZWQgfHwgcmVhZE9ubHl9XHJcbiAgICAgICAgICB0b29sdGlwPXt7XHJcbiAgICAgICAgICAgIC4uLmRlZmF1bHRUb29sdGlwT3B0aW9ucyxcclxuICAgICAgICAgICAgdGl0bGU6IFwiUmVzdGFydCB0aGUgZGVidWdnZXIgdXNpbmcgdGhlIHNhbWUgc2V0dGluZ3MgYXMgdGhlIGN1cnJlbnQgZGVidWcgc2Vzc2lvblwiLFxyXG4gICAgICAgICAgICBrZXlCaW5kaW5nQ29tbWFuZDogXCJkZWJ1Z2dlcjpyZXN0YXJ0LWRlYnVnZ2luZ1wiLFxyXG4gICAgICAgICAgfX1cclxuICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcclxuICAgICAgICAgICAgaW52YXJpYW50KGZvY3VzZWRQcm9jZXNzICE9IG51bGwpXHJcbiAgICAgICAgICAgIHNlcnZpY2UucmVzdGFydFByb2Nlc3MoZm9jdXNlZFByb2Nlc3MpXHJcbiAgICAgICAgICB9fVxyXG4gICAgICAgIC8+XHJcbiAgICAgICkgOiBudWxsXHJcblxyXG4gICAgY29uc3QgRGVidWdnZXJTdGVwQnV0dG9uID0gKHByb3BzOiB7XHJcbiAgICAgIC8qIGVzbGludC1kaXNhYmxlIHJlYWN0L25vLXVudXNlZC1wcm9wLXR5cGVzICovXHJcbiAgICAgIGljb246IFJlYWN0LkVsZW1lbnQ8YW55PixcclxuICAgICAgdGl0bGU6IHN0cmluZyxcclxuICAgICAga2V5QmluZGluZ0NvbW1hbmQ6IHN0cmluZyxcclxuICAgICAgZGlzYWJsZWQ6IGJvb2xlYW4sXHJcbiAgICAgIG9uQ2xpY2s6ICgpID0+IG1peGVkLFxyXG4gICAgICAvKiBlc2xpbnQtZW5hYmxlIHJlYWN0L25vLXVudXNlZC1wcm9wLXR5cGVzICovXHJcbiAgICB9KSA9PiAoXHJcbiAgICAgIDxTVkdCdXR0b25cclxuICAgICAgICBpY29uPXtwcm9wcy5pY29ufVxyXG4gICAgICAgIGRpc2FibGVkPXtwcm9wcy5kaXNhYmxlZCB8fCByZWFkT25seX1cclxuICAgICAgICB0b29sdGlwPXt7XHJcbiAgICAgICAgICAuLi5kZWZhdWx0VG9vbHRpcE9wdGlvbnMsXHJcbiAgICAgICAgICB0aXRsZTogcHJvcHMudGl0bGUsXHJcbiAgICAgICAgICBrZXlCaW5kaW5nQ29tbWFuZDogcHJvcHMua2V5QmluZGluZ0NvbW1hbmQsXHJcbiAgICAgICAgfX1cclxuICAgICAgICBvbkNsaWNrPXtwcm9wcy5vbkNsaWNrfVxyXG4gICAgICAvPlxyXG4gICAgKVxyXG5cclxuICAgIGNvbnN0IHBhdXNhYmxlVGhyZWFkID0gdGhpcy5fZ2V0UGF1c2FibGVUaHJlYWQoKVxyXG4gICAgbGV0IHBsYXlQYXVzZVRpdGxlXHJcbiAgICBpZiAoaXNQYXVzaW5nKSB7XHJcbiAgICAgIHBsYXlQYXVzZVRpdGxlID0gXCJXYWl0aW5nIGZvciBwYXVzZS4uLlwiXHJcbiAgICB9IGVsc2UgaWYgKGlzUGF1c2VkKSB7XHJcbiAgICAgIHBsYXlQYXVzZVRpdGxlID0gXCJDb250aW51ZVwiXHJcbiAgICB9IGVsc2UgaWYgKHBhdXNhYmxlVGhyZWFkID09IG51bGwpIHtcclxuICAgICAgcGxheVBhdXNlVGl0bGUgPSBcIk5vIHJ1bm5pbmcgdGhyZWFkcyB0byBwYXVzZSFcIlxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcGxheVBhdXNlVGl0bGUgPSBcIlBhdXNlXCJcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBwcm9jZXNzID0gc2VydmljZS5nZXRNb2RlbCgpLmdldFByb2Nlc3NlcygpWzBdXHJcbiAgICBjb25zdCBhdHRhY2hlZCA9IHByb2Nlc3MgIT0gbnVsbCAmJiBwcm9jZXNzLmNvbmZpZ3VyYXRpb24uZGVidWdNb2RlID09PSBcImF0dGFjaFwiXHJcblxyXG4gICAgcmV0dXJuIChcclxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zdGVwcGluZy1jb21wb25lbnRcIj5cclxuICAgICAgICA8QnV0dG9uR3JvdXAgY2xhc3NOYW1lPVwiZGVidWdnZXItc3RlcHBpbmctYnV0dG9uZ3JvdXBcIj5cclxuICAgICAgICAgIHtyZXN0YXJ0RGVidWdnZXJCdXR0b259XHJcbiAgICAgICAgICA8QnV0dG9uXHJcbiAgICAgICAgICAgIGRpc2FibGVkPXtpc1BhdXNpbmcgfHwgcGF1c2FibGVUaHJlYWQgPT0gbnVsbCB8fCByZWFkT25seX1cclxuICAgICAgICAgICAgdG9vbHRpcD17e1xyXG4gICAgICAgICAgICAgIC4uLmRlZmF1bHRUb29sdGlwT3B0aW9ucyxcclxuICAgICAgICAgICAgICB0aXRsZTogcGxheVBhdXNlVGl0bGUsXHJcbiAgICAgICAgICAgICAga2V5QmluZGluZ0NvbW1hbmQ6IGlzUGF1c2VkID8gXCJkZWJ1Z2dlcjpjb250aW51ZS1kZWJ1Z2dpbmdcIiA6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgfX1cclxuICAgICAgICAgICAgb25DbGljaz17dGhpcy5fdG9nZ2xlUGF1c2VTdGF0ZS5iaW5kKHRoaXMpfVxyXG4gICAgICAgICAgPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXN0ZXBwaW5nLXBsYXlwYXVzZS1idXR0b25cIj5cclxuICAgICAgICAgICAgICB7cGxheVBhdXNlSWNvbn1cclxuICAgICAgICAgICAgICB7bG9hZGluZ0luZGljYXRvcn1cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICA8L0J1dHRvbj5cclxuICAgICAgICAgIDxEZWJ1Z2dlclN0ZXBCdXR0b25cclxuICAgICAgICAgICAgaWNvbj17U1RFUF9PVkVSX0lDT059XHJcbiAgICAgICAgICAgIGRpc2FibGVkPXshaXNQYXVzZWQgfHwgZm9jdXNlZFRocmVhZCA9PSBudWxsfVxyXG4gICAgICAgICAgICB0aXRsZT1cIlN0ZXAgb3ZlclwiXHJcbiAgICAgICAgICAgIGtleUJpbmRpbmdDb21tYW5kPVwiZGVidWdnZXI6c3RlcC1vdmVyXCJcclxuICAgICAgICAgICAgb25DbGljaz17KCkgPT4gbnVsbHRocm93cyhmb2N1c2VkVGhyZWFkKS5uZXh0KCl9XHJcbiAgICAgICAgICAvPlxyXG4gICAgICAgICAgPERlYnVnZ2VyU3RlcEJ1dHRvblxyXG4gICAgICAgICAgICBpY29uPXtTVEVQX0lOVE9fSUNPTn1cclxuICAgICAgICAgICAgZGlzYWJsZWQ9eyFpc1BhdXNlZCB8fCBmb2N1c2VkVGhyZWFkID09IG51bGx9XHJcbiAgICAgICAgICAgIHRpdGxlPVwiU3RlcCBpbnRvXCJcclxuICAgICAgICAgICAga2V5QmluZGluZ0NvbW1hbmQ9XCJkZWJ1Z2dlcjpzdGVwLWludG9cIlxyXG4gICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiBudWxsdGhyb3dzKGZvY3VzZWRUaHJlYWQpLnN0ZXBJbigpfVxyXG4gICAgICAgICAgLz5cclxuICAgICAgICAgIDxEZWJ1Z2dlclN0ZXBCdXR0b25cclxuICAgICAgICAgICAgaWNvbj17U1RFUF9PVVRfSUNPTn1cclxuICAgICAgICAgICAgZGlzYWJsZWQ9eyFpc1BhdXNlZCB8fCBmb2N1c2VkVGhyZWFkID09IG51bGx9XHJcbiAgICAgICAgICAgIHRpdGxlPVwiU3RlcCBvdXRcIlxyXG4gICAgICAgICAgICBrZXlCaW5kaW5nQ29tbWFuZD1cImRlYnVnZ2VyOnN0ZXAtb3V0XCJcclxuICAgICAgICAgICAgb25DbGljaz17KCkgPT4gbnVsbHRocm93cyhmb2N1c2VkVGhyZWFkKS5zdGVwT3V0KCl9XHJcbiAgICAgICAgICAvPlxyXG4gICAgICAgICAgPEJ1dHRvblxyXG4gICAgICAgICAgICBpY29uPVwicHJpbWl0aXZlLXNxdWFyZVwiXHJcbiAgICAgICAgICAgIGRpc2FibGVkPXtpc1N0b3BwZWQgfHwgZm9jdXNlZFByb2Nlc3MgPT0gbnVsbH1cclxuICAgICAgICAgICAgdG9vbHRpcD17e1xyXG4gICAgICAgICAgICAgIC4uLmRlZmF1bHRUb29sdGlwT3B0aW9ucyxcclxuICAgICAgICAgICAgICB0aXRsZTogYXR0YWNoZWQgPyBcIkRldGFjaFwiIDogXCJUZXJtaW5hdGVcIixcclxuICAgICAgICAgICAgICBrZXlCaW5kaW5nQ29tbWFuZDogXCJkZWJ1Z2dlcjpzdG9wLWRlYnVnZ2luZ1wiLFxyXG4gICAgICAgICAgICB9fVxyXG4gICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XHJcbiAgICAgICAgICAgICAgaWYgKGZvY3VzZWRQcm9jZXNzICE9IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHNlcnZpY2Uuc3RvcFByb2Nlc3MoZm9jdXNlZFByb2Nlc3MpXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9fVxyXG4gICAgICAgICAgLz5cclxuICAgICAgICA8L0J1dHRvbkdyb3VwPlxyXG4gICAgICAgIDxCdXR0b25Hcm91cCBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zdGVwcGluZy1idXR0b25ncm91cFwiPlxyXG4gICAgICAgICAge2N1c3RvbUNvbnRyb2xCdXR0b25zLm1hcCgoc3BlY2lmaWNhdGlvbiwgaSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBidXR0b25Qcm9wcyA9IHtcclxuICAgICAgICAgICAgICAuLi5zcGVjaWZpY2F0aW9uLFxyXG4gICAgICAgICAgICAgIHRvb2x0aXA6IHtcclxuICAgICAgICAgICAgICAgIHRpdGxlOiBzcGVjaWZpY2F0aW9uLnRpdGxlLFxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIDxCdXR0b24gey4uLmJ1dHRvblByb3BzfSBrZXk9e2l9IC8+XHJcbiAgICAgICAgICB9KX1cclxuICAgICAgICA8L0J1dHRvbkdyb3VwPlxyXG4gICAgICA8L2Rpdj5cclxuICAgIClcclxuICB9XHJcbn1cclxuIl19