"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _AtomInput = require("@atom-ide-community/nuclide-commons-ui/AtomInput");

var React = _interopRequireWildcard(require("react"));

var _Button = require("@atom-ide-community/nuclide-commons-ui/Button");

var _ButtonGroup = require("@atom-ide-community/nuclide-commons-ui/ButtonGroup");

var _nuclideUri = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/nuclideUri"));

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _Checkbox = require("@atom-ide-community/nuclide-commons-ui/Checkbox");

var _Modal = require("@atom-ide-community/nuclide-commons-ui/Modal");

var _rxjs = require("rxjs");

var _analytics = require("@atom-ide-community/nuclide-commons/analytics");

var _constants = require("../constants");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

class BreakpointConfigComponent extends React.Component {
  constructor(props) {
    var _this$props$breakpoin, _this$props$breakpoin2;

    super(props);
    this._conditionInput = void 0;
    this.props = void 0;
    this.state = void 0;
    this._disposables = void 0;
    this._disposables = new _UniversalDisposable.default();
    this._conditionInput = /*#__PURE__*/React.createRef();
    this.state = {
      bpId: this.props.breakpoint.getId(),
      enabledChecked: this.props.breakpoint.enabled,
      condition: (_this$props$breakpoin = this.props.breakpoint.condition) !== null && _this$props$breakpoin !== void 0 ? _this$props$breakpoin : "",
      logMessage: (_this$props$breakpoin2 = this.props.breakpoint.logMessage) !== null && _this$props$breakpoin2 !== void 0 ? _this$props$breakpoin2 : "",
      allowLogMessage: false
    };
    const model = this.props.service.getModel();

    this._disposables.add(model.onDidChangeBreakpoints(() => {
      const breakpoint = model.getBreakpoints().filter(bp => bp.getId() === this.state.bpId);

      if (breakpoint == null) {
        // Breakpoint no longer exists.
        this.props.onDismiss();
      }

      this.forceUpdate();
    }), _rxjs.Observable.fromPromise(this.props.allowLogMessage).subscribe(allowLogMessage => {
      this.setState({
        allowLogMessage
      });
    }));
  }

  componentDidMount() {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_BREAKPOINT_CONFIG_UI_SHOW, {
      fileExtension: _nuclideUri.default.extname(this.props.breakpoint.uri)
    });

    this._disposables.add(atom.commands.add("atom-workspace", "core:cancel", this.props.onDismiss), atom.commands.add("atom-workspace", "core:confirm", this._updateBreakpoint.bind(this)), _rxjs.Observable.timer(100).subscribe(() => {
      if (this._conditionInput.current != null) {
        this._conditionInput.current.focus();
      }
    }));
  }

  componentWillUnmount() {
    this._disposables.dispose();
  }

  async _updateBreakpoint() {
    var _breakpoint$condition, _breakpoint$logMessag;

    const {
      breakpoint,
      service
    } = this.props;
    const {
      enabledChecked
    } = this.state;
    service.enableOrDisableBreakpoints(enabledChecked, this.props.breakpoint);
    const condition = this.state.condition.trim();
    const logMessage = this.state.logMessage.trim();

    if (condition === ((_breakpoint$condition = breakpoint.condition) !== null && _breakpoint$condition !== void 0 ? _breakpoint$condition : "") && condition === ((_breakpoint$logMessag = breakpoint.logMessage) !== null && _breakpoint$logMessag !== void 0 ? _breakpoint$logMessag : "")) {
      this.props.onDismiss();
      return;
    }

    await service.removeBreakpoints(breakpoint.getId());
    const bp = {
      line: breakpoint.line,
      column: breakpoint.column,
      enabled: breakpoint.enabled,
      id: breakpoint.getId(),
      uri: breakpoint.uri
    };

    if (condition !== "") {
      bp.condition = condition;
    }

    if (logMessage !== "") {
      bp.logMessage = logMessage;
    }

    await service.addUIBreakpoints([bp]);
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_BREAKPOINT_UPDATE_CONDITION, {
      path: breakpoint.uri,
      line: breakpoint.line,
      condition,
      logMessage,
      fileExtension: _nuclideUri.default.extname(breakpoint.uri)
    });
    this.props.onDismiss();
  }

  _renderLogMessage() {
    if (!this.state.allowLogMessage) {
      return null;
    }

    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      className: "block"
    }, /*#__PURE__*/React.createElement(_AtomInput.AtomInput, {
      placeholderText: "Breakpoint log message...",
      value: this.state.logMessage,
      size: "sm",
      onDidChange: value => this.setState({
        logMessage: value
      })
    })), /*#__PURE__*/React.createElement("label", null, "This message will be logged to the Nuclide console each time the corresponding line is hit. The message can be interpolated with expressions by using curly braces. Example: \"Counter: ", "{counter}", "\"."));
  }

  render() {
    return /*#__PURE__*/React.createElement(_Modal.Modal, {
      onDismiss: this.props.onDismiss
    }, /*#__PURE__*/React.createElement("div", {
      className: "padded debugger-bp-dialog"
    }, /*#__PURE__*/React.createElement("h1", {
      className: "debugger-bp-config-header"
    }, "Edit breakpoint"), /*#__PURE__*/React.createElement("div", {
      className: "block"
    }, /*#__PURE__*/React.createElement("label", null, "Breakpoint at ", _nuclideUri.default.basename(this.props.breakpoint.uri), ":", this.props.breakpoint.line)), /*#__PURE__*/React.createElement("div", {
      className: "block"
    }, /*#__PURE__*/React.createElement(_Checkbox.Checkbox, {
      onChange: isChecked => {
        (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_BREAKPOINT_TOGGLE_ENABLED, {
          enabled: isChecked
        });
        this.setState({
          enabledChecked: isChecked
        });
      },
      checked: this.state.enabledChecked,
      label: "Enable breakpoint"
    })), /*#__PURE__*/React.createElement("div", {
      className: "block"
    }, /*#__PURE__*/React.createElement(_AtomInput.AtomInput, {
      placeholderText: "Breakpoint hit condition...",
      value: this.state.condition,
      size: "sm",
      ref: this._conditionInput,
      autofocus: true,
      onDidChange: value => this.setState({
        condition: value
      })
    })), /*#__PURE__*/React.createElement("label", null, "This expression will be evaluated each time the corresponding line is hit, but the debugger will only break execution if the expression evaluates to true."), this._renderLogMessage(), /*#__PURE__*/React.createElement("div", {
      className: "debugger-bp-config-actions"
    }, /*#__PURE__*/React.createElement(_ButtonGroup.ButtonGroup, null, /*#__PURE__*/React.createElement(_Button.Button, {
      onClick: this.props.onDismiss
    }, "Cancel"), /*#__PURE__*/React.createElement(_Button.Button, {
      buttonType: _Button.ButtonTypes.PRIMARY,
      onClick: this._updateBreakpoint.bind(this)
    }, "Update")))));
  }

}

exports.default = BreakpointConfigComponent;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyZWFrcG9pbnRDb25maWdDb21wb25lbnQuanMiXSwibmFtZXMiOlsiQnJlYWtwb2ludENvbmZpZ0NvbXBvbmVudCIsIlJlYWN0IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJwcm9wcyIsIl9jb25kaXRpb25JbnB1dCIsInN0YXRlIiwiX2Rpc3Bvc2FibGVzIiwiVW5pdmVyc2FsRGlzcG9zYWJsZSIsImNyZWF0ZVJlZiIsImJwSWQiLCJicmVha3BvaW50IiwiZ2V0SWQiLCJlbmFibGVkQ2hlY2tlZCIsImVuYWJsZWQiLCJjb25kaXRpb24iLCJsb2dNZXNzYWdlIiwiYWxsb3dMb2dNZXNzYWdlIiwibW9kZWwiLCJzZXJ2aWNlIiwiZ2V0TW9kZWwiLCJhZGQiLCJvbkRpZENoYW5nZUJyZWFrcG9pbnRzIiwiZ2V0QnJlYWtwb2ludHMiLCJmaWx0ZXIiLCJicCIsIm9uRGlzbWlzcyIsImZvcmNlVXBkYXRlIiwiT2JzZXJ2YWJsZSIsImZyb21Qcm9taXNlIiwic3Vic2NyaWJlIiwic2V0U3RhdGUiLCJjb21wb25lbnREaWRNb3VudCIsIkFuYWx5dGljc0V2ZW50cyIsIkRFQlVHR0VSX0JSRUFLUE9JTlRfQ09ORklHX1VJX1NIT1ciLCJmaWxlRXh0ZW5zaW9uIiwibnVjbGlkZVVyaSIsImV4dG5hbWUiLCJ1cmkiLCJhdG9tIiwiY29tbWFuZHMiLCJfdXBkYXRlQnJlYWtwb2ludCIsImJpbmQiLCJ0aW1lciIsImN1cnJlbnQiLCJmb2N1cyIsImNvbXBvbmVudFdpbGxVbm1vdW50IiwiZGlzcG9zZSIsImVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzIiwidHJpbSIsInJlbW92ZUJyZWFrcG9pbnRzIiwibGluZSIsImNvbHVtbiIsImlkIiwiYWRkVUlCcmVha3BvaW50cyIsIkRFQlVHR0VSX0JSRUFLUE9JTlRfVVBEQVRFX0NPTkRJVElPTiIsInBhdGgiLCJfcmVuZGVyTG9nTWVzc2FnZSIsInZhbHVlIiwicmVuZGVyIiwiYmFzZW5hbWUiLCJpc0NoZWNrZWQiLCJERUJVR0dFUl9CUkVBS1BPSU5UX1RPR0dMRV9FTkFCTEVEIiwiQnV0dG9uVHlwZXMiLCJQUklNQVJZIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBaUJlLE1BQU1BLHlCQUFOLFNBQXdDQyxLQUFLLENBQUNDLFNBQTlDLENBQThFO0FBTTNGQyxFQUFBQSxXQUFXLENBQUNDLEtBQUQsRUFBbUI7QUFBQTs7QUFDNUIsVUFBTUEsS0FBTjtBQUQ0QixTQUw5QkMsZUFLOEI7QUFBQSxTQUo5QkQsS0FJOEI7QUFBQSxTQUg5QkUsS0FHOEI7QUFBQSxTQUY5QkMsWUFFOEI7QUFFNUIsU0FBS0EsWUFBTCxHQUFvQixJQUFJQyw0QkFBSixFQUFwQjtBQUNBLFNBQUtILGVBQUwsZ0JBQXVCSixLQUFLLENBQUNRLFNBQU4sRUFBdkI7QUFDQSxTQUFLSCxLQUFMLEdBQWE7QUFDWEksTUFBQUEsSUFBSSxFQUFFLEtBQUtOLEtBQUwsQ0FBV08sVUFBWCxDQUFzQkMsS0FBdEIsRUFESztBQUVYQyxNQUFBQSxjQUFjLEVBQUUsS0FBS1QsS0FBTCxDQUFXTyxVQUFYLENBQXNCRyxPQUYzQjtBQUdYQyxNQUFBQSxTQUFTLDJCQUFFLEtBQUtYLEtBQUwsQ0FBV08sVUFBWCxDQUFzQkksU0FBeEIseUVBQXFDLEVBSG5DO0FBSVhDLE1BQUFBLFVBQVUsNEJBQUUsS0FBS1osS0FBTCxDQUFXTyxVQUFYLENBQXNCSyxVQUF4QiwyRUFBc0MsRUFKckM7QUFLWEMsTUFBQUEsZUFBZSxFQUFFO0FBTE4sS0FBYjtBQVFBLFVBQU1DLEtBQUssR0FBRyxLQUFLZCxLQUFMLENBQVdlLE9BQVgsQ0FBbUJDLFFBQW5CLEVBQWQ7O0FBQ0EsU0FBS2IsWUFBTCxDQUFrQmMsR0FBbEIsQ0FDRUgsS0FBSyxDQUFDSSxzQkFBTixDQUE2QixNQUFNO0FBQ2pDLFlBQU1YLFVBQVUsR0FBR08sS0FBSyxDQUFDSyxjQUFOLEdBQXVCQyxNQUF2QixDQUErQkMsRUFBRCxJQUFRQSxFQUFFLENBQUNiLEtBQUgsT0FBZSxLQUFLTixLQUFMLENBQVdJLElBQWhFLENBQW5COztBQUNBLFVBQUlDLFVBQVUsSUFBSSxJQUFsQixFQUF3QjtBQUN0QjtBQUNBLGFBQUtQLEtBQUwsQ0FBV3NCLFNBQVg7QUFDRDs7QUFDRCxXQUFLQyxXQUFMO0FBQ0QsS0FQRCxDQURGLEVBU0VDLGlCQUFXQyxXQUFYLENBQXVCLEtBQUt6QixLQUFMLENBQVdhLGVBQWxDLEVBQW1EYSxTQUFuRCxDQUE4RGIsZUFBRCxJQUFxQjtBQUNoRixXQUFLYyxRQUFMLENBQWM7QUFBRWQsUUFBQUE7QUFBRixPQUFkO0FBQ0QsS0FGRCxDQVRGO0FBYUQ7O0FBRURlLEVBQUFBLGlCQUFpQixHQUFTO0FBQ3hCLDBCQUFNQywyQkFBZ0JDLGtDQUF0QixFQUEwRDtBQUN4REMsTUFBQUEsYUFBYSxFQUFFQyxvQkFBV0MsT0FBWCxDQUFtQixLQUFLakMsS0FBTCxDQUFXTyxVQUFYLENBQXNCMkIsR0FBekM7QUFEeUMsS0FBMUQ7O0FBR0EsU0FBSy9CLFlBQUwsQ0FBa0JjLEdBQWxCLENBQ0VrQixJQUFJLENBQUNDLFFBQUwsQ0FBY25CLEdBQWQsQ0FBa0IsZ0JBQWxCLEVBQW9DLGFBQXBDLEVBQW1ELEtBQUtqQixLQUFMLENBQVdzQixTQUE5RCxDQURGLEVBRUVhLElBQUksQ0FBQ0MsUUFBTCxDQUFjbkIsR0FBZCxDQUFrQixnQkFBbEIsRUFBb0MsY0FBcEMsRUFBb0QsS0FBS29CLGlCQUFMLENBQXVCQyxJQUF2QixDQUE0QixJQUE1QixDQUFwRCxDQUZGLEVBR0VkLGlCQUFXZSxLQUFYLENBQWlCLEdBQWpCLEVBQXNCYixTQUF0QixDQUFnQyxNQUFNO0FBQ3BDLFVBQUksS0FBS3pCLGVBQUwsQ0FBcUJ1QyxPQUFyQixJQUFnQyxJQUFwQyxFQUEwQztBQUN4QyxhQUFLdkMsZUFBTCxDQUFxQnVDLE9BQXJCLENBQTZCQyxLQUE3QjtBQUNEO0FBQ0YsS0FKRCxDQUhGO0FBU0Q7O0FBRURDLEVBQUFBLG9CQUFvQixHQUFTO0FBQzNCLFNBQUt2QyxZQUFMLENBQWtCd0MsT0FBbEI7QUFDRDs7QUFFRCxRQUFNTixpQkFBTixHQUF5QztBQUFBOztBQUN2QyxVQUFNO0FBQUU5QixNQUFBQSxVQUFGO0FBQWNRLE1BQUFBO0FBQWQsUUFBMEIsS0FBS2YsS0FBckM7QUFDQSxVQUFNO0FBQUVTLE1BQUFBO0FBQUYsUUFBcUIsS0FBS1AsS0FBaEM7QUFDQWEsSUFBQUEsT0FBTyxDQUFDNkIsMEJBQVIsQ0FBbUNuQyxjQUFuQyxFQUFtRCxLQUFLVCxLQUFMLENBQVdPLFVBQTlEO0FBQ0EsVUFBTUksU0FBUyxHQUFHLEtBQUtULEtBQUwsQ0FBV1MsU0FBWCxDQUFxQmtDLElBQXJCLEVBQWxCO0FBQ0EsVUFBTWpDLFVBQVUsR0FBRyxLQUFLVixLQUFMLENBQVdVLFVBQVgsQ0FBc0JpQyxJQUF0QixFQUFuQjs7QUFDQSxRQUFJbEMsU0FBUywrQkFBTUosVUFBVSxDQUFDSSxTQUFqQix5RUFBOEIsRUFBOUIsQ0FBVCxJQUE4Q0EsU0FBUywrQkFBTUosVUFBVSxDQUFDSyxVQUFqQix5RUFBK0IsRUFBL0IsQ0FBM0QsRUFBK0Y7QUFDN0YsV0FBS1osS0FBTCxDQUFXc0IsU0FBWDtBQUNBO0FBQ0Q7O0FBRUQsVUFBTVAsT0FBTyxDQUFDK0IsaUJBQVIsQ0FBMEJ2QyxVQUFVLENBQUNDLEtBQVgsRUFBMUIsQ0FBTjtBQUVBLFVBQU1hLEVBQWlCLEdBQUc7QUFDeEIwQixNQUFBQSxJQUFJLEVBQUV4QyxVQUFVLENBQUN3QyxJQURPO0FBRXhCQyxNQUFBQSxNQUFNLEVBQUV6QyxVQUFVLENBQUN5QyxNQUZLO0FBR3hCdEMsTUFBQUEsT0FBTyxFQUFFSCxVQUFVLENBQUNHLE9BSEk7QUFJeEJ1QyxNQUFBQSxFQUFFLEVBQUUxQyxVQUFVLENBQUNDLEtBQVgsRUFKb0I7QUFLeEIwQixNQUFBQSxHQUFHLEVBQUUzQixVQUFVLENBQUMyQjtBQUxRLEtBQTFCOztBQU9BLFFBQUl2QixTQUFTLEtBQUssRUFBbEIsRUFBc0I7QUFDcEJVLE1BQUFBLEVBQUUsQ0FBQ1YsU0FBSCxHQUFlQSxTQUFmO0FBQ0Q7O0FBQ0QsUUFBSUMsVUFBVSxLQUFLLEVBQW5CLEVBQXVCO0FBQ3JCUyxNQUFBQSxFQUFFLENBQUNULFVBQUgsR0FBZ0JBLFVBQWhCO0FBQ0Q7O0FBRUQsVUFBTUcsT0FBTyxDQUFDbUMsZ0JBQVIsQ0FBeUIsQ0FBQzdCLEVBQUQsQ0FBekIsQ0FBTjtBQUNBLDBCQUFNUSwyQkFBZ0JzQixvQ0FBdEIsRUFBNEQ7QUFDMURDLE1BQUFBLElBQUksRUFBRTdDLFVBQVUsQ0FBQzJCLEdBRHlDO0FBRTFEYSxNQUFBQSxJQUFJLEVBQUV4QyxVQUFVLENBQUN3QyxJQUZ5QztBQUcxRHBDLE1BQUFBLFNBSDBEO0FBSTFEQyxNQUFBQSxVQUowRDtBQUsxRG1CLE1BQUFBLGFBQWEsRUFBRUMsb0JBQVdDLE9BQVgsQ0FBbUIxQixVQUFVLENBQUMyQixHQUE5QjtBQUwyQyxLQUE1RDtBQU9BLFNBQUtsQyxLQUFMLENBQVdzQixTQUFYO0FBQ0Q7O0FBRUQrQixFQUFBQSxpQkFBaUIsR0FBZ0I7QUFDL0IsUUFBSSxDQUFDLEtBQUtuRCxLQUFMLENBQVdXLGVBQWhCLEVBQWlDO0FBQy9CLGFBQU8sSUFBUDtBQUNEOztBQUVELHdCQUNFLHVEQUNFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRSxvQkFBQyxvQkFBRDtBQUNFLE1BQUEsZUFBZSxFQUFDLDJCQURsQjtBQUVFLE1BQUEsS0FBSyxFQUFFLEtBQUtYLEtBQUwsQ0FBV1UsVUFGcEI7QUFHRSxNQUFBLElBQUksRUFBQyxJQUhQO0FBSUUsTUFBQSxXQUFXLEVBQUcwQyxLQUFELElBQVcsS0FBSzNCLFFBQUwsQ0FBYztBQUFFZixRQUFBQSxVQUFVLEVBQUUwQztBQUFkLE9BQWQ7QUFKMUIsTUFERixDQURGLGVBU0UsK05BRTJFLFdBRjNFLFFBVEYsQ0FERjtBQWdCRDs7QUFFREMsRUFBQUEsTUFBTSxHQUFlO0FBQ25CLHdCQUNFLG9CQUFDLFlBQUQ7QUFBTyxNQUFBLFNBQVMsRUFBRSxLQUFLdkQsS0FBTCxDQUFXc0I7QUFBN0Isb0JBQ0U7QUFBSyxNQUFBLFNBQVMsRUFBQztBQUFmLG9CQUNFO0FBQUksTUFBQSxTQUFTLEVBQUM7QUFBZCx5QkFERixlQUVFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRSxxREFDaUJVLG9CQUFXd0IsUUFBWCxDQUFvQixLQUFLeEQsS0FBTCxDQUFXTyxVQUFYLENBQXNCMkIsR0FBMUMsQ0FEakIsT0FDa0UsS0FBS2xDLEtBQUwsQ0FBV08sVUFBWCxDQUFzQndDLElBRHhGLENBREYsQ0FGRixlQU9FO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRSxvQkFBQyxrQkFBRDtBQUNFLE1BQUEsUUFBUSxFQUFHVSxTQUFELElBQWU7QUFDdkIsOEJBQU01QiwyQkFBZ0I2QixrQ0FBdEIsRUFBMEQ7QUFDeERoRCxVQUFBQSxPQUFPLEVBQUUrQztBQUQrQyxTQUExRDtBQUdBLGFBQUs5QixRQUFMLENBQWM7QUFDWmxCLFVBQUFBLGNBQWMsRUFBRWdEO0FBREosU0FBZDtBQUdELE9BUkg7QUFTRSxNQUFBLE9BQU8sRUFBRSxLQUFLdkQsS0FBTCxDQUFXTyxjQVR0QjtBQVVFLE1BQUEsS0FBSyxFQUFDO0FBVlIsTUFERixDQVBGLGVBcUJFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRSxvQkFBQyxvQkFBRDtBQUNFLE1BQUEsZUFBZSxFQUFDLDZCQURsQjtBQUVFLE1BQUEsS0FBSyxFQUFFLEtBQUtQLEtBQUwsQ0FBV1MsU0FGcEI7QUFHRSxNQUFBLElBQUksRUFBQyxJQUhQO0FBSUUsTUFBQSxHQUFHLEVBQUUsS0FBS1YsZUFKWjtBQUtFLE1BQUEsU0FBUyxFQUFFLElBTGI7QUFNRSxNQUFBLFdBQVcsRUFBR3FELEtBQUQsSUFBVyxLQUFLM0IsUUFBTCxDQUFjO0FBQUVoQixRQUFBQSxTQUFTLEVBQUUyQztBQUFiLE9BQWQ7QUFOMUIsTUFERixDQXJCRixlQStCRSxnTUEvQkYsRUFtQ0csS0FBS0QsaUJBQUwsRUFuQ0gsZUFvQ0U7QUFBSyxNQUFBLFNBQVMsRUFBQztBQUFmLG9CQUNFLG9CQUFDLHdCQUFELHFCQUNFLG9CQUFDLGNBQUQ7QUFBUSxNQUFBLE9BQU8sRUFBRSxLQUFLckQsS0FBTCxDQUFXc0I7QUFBNUIsZ0JBREYsZUFFRSxvQkFBQyxjQUFEO0FBQVEsTUFBQSxVQUFVLEVBQUVxQyxvQkFBWUMsT0FBaEM7QUFBeUMsTUFBQSxPQUFPLEVBQUUsS0FBS3ZCLGlCQUFMLENBQXVCQyxJQUF2QixDQUE0QixJQUE1QjtBQUFsRCxnQkFGRixDQURGLENBcENGLENBREYsQ0FERjtBQWlERDs7QUFwSzBGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBJQnJlYWtwb2ludCwgSVVJQnJlYWtwb2ludCwgSURlYnVnU2VydmljZSB9IGZyb20gXCIuLi90eXBlc1wiXG5cbmltcG9ydCB7IEF0b21JbnB1dCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9BdG9tSW5wdXRcIlxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcbmltcG9ydCB7IEJ1dHRvbiwgQnV0dG9uVHlwZXMgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvQnV0dG9uXCJcbmltcG9ydCB7IEJ1dHRvbkdyb3VwIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0J1dHRvbkdyb3VwXCJcbmltcG9ydCBudWNsaWRlVXJpIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9udWNsaWRlVXJpXCJcbmltcG9ydCBVbml2ZXJzYWxEaXNwb3NhYmxlIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9Vbml2ZXJzYWxEaXNwb3NhYmxlXCJcbmltcG9ydCB7IENoZWNrYm94IH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0NoZWNrYm94XCJcbmltcG9ydCB7IE1vZGFsIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL01vZGFsXCJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqc1wiXG5pbXBvcnQgeyB0cmFjayB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9hbmFseXRpY3NcIlxuaW1wb3J0IHsgQW5hbHl0aWNzRXZlbnRzIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5cbnR5cGUgUHJvcHNUeXBlID0ge1xuICBvbkRpc21pc3M6ICgpID0+IHZvaWQsXG4gIGJyZWFrcG9pbnQ6IElCcmVha3BvaW50LFxuICBzZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuICBhbGxvd0xvZ01lc3NhZ2U6IFByb21pc2U8Ym9vbGVhbj4sXG59XG5cbnR5cGUgU3RhdGVUeXBlID0ge1xuICBicElkOiBzdHJpbmcsXG4gIGVuYWJsZWRDaGVja2VkOiBib29sZWFuLFxuICBjb25kaXRpb246IHN0cmluZyxcbiAgbG9nTWVzc2FnZTogc3RyaW5nLFxuICBhbGxvd0xvZ01lc3NhZ2U6IGJvb2xlYW4sXG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEJyZWFrcG9pbnRDb25maWdDb21wb25lbnQgZXh0ZW5kcyBSZWFjdC5Db21wb25lbnQ8UHJvcHNUeXBlLCBTdGF0ZVR5cGU+IHtcbiAgX2NvbmRpdGlvbklucHV0OiBSZWFjdENvbXBvbmVudFJlZjxBdG9tSW5wdXQ+XG4gIHByb3BzOiBQcm9wc1R5cGVcbiAgc3RhdGU6IFN0YXRlVHlwZVxuICBfZGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcblxuICBjb25zdHJ1Y3Rvcihwcm9wczogUHJvcHNUeXBlKSB7XG4gICAgc3VwZXIocHJvcHMpXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5fY29uZGl0aW9uSW5wdXQgPSBSZWFjdC5jcmVhdGVSZWYoKVxuICAgIHRoaXMuc3RhdGUgPSB7XG4gICAgICBicElkOiB0aGlzLnByb3BzLmJyZWFrcG9pbnQuZ2V0SWQoKSxcbiAgICAgIGVuYWJsZWRDaGVja2VkOiB0aGlzLnByb3BzLmJyZWFrcG9pbnQuZW5hYmxlZCxcbiAgICAgIGNvbmRpdGlvbjogdGhpcy5wcm9wcy5icmVha3BvaW50LmNvbmRpdGlvbiA/PyBcIlwiLFxuICAgICAgbG9nTWVzc2FnZTogdGhpcy5wcm9wcy5icmVha3BvaW50LmxvZ01lc3NhZ2UgPz8gXCJcIixcbiAgICAgIGFsbG93TG9nTWVzc2FnZTogZmFsc2UsXG4gICAgfVxuXG4gICAgY29uc3QgbW9kZWwgPSB0aGlzLnByb3BzLnNlcnZpY2UuZ2V0TW9kZWwoKVxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcbiAgICAgIG1vZGVsLm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMoKCkgPT4ge1xuICAgICAgICBjb25zdCBicmVha3BvaW50ID0gbW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5maWx0ZXIoKGJwKSA9PiBicC5nZXRJZCgpID09PSB0aGlzLnN0YXRlLmJwSWQpXG4gICAgICAgIGlmIChicmVha3BvaW50ID09IG51bGwpIHtcbiAgICAgICAgICAvLyBCcmVha3BvaW50IG5vIGxvbmdlciBleGlzdHMuXG4gICAgICAgICAgdGhpcy5wcm9wcy5vbkRpc21pc3MoKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuZm9yY2VVcGRhdGUoKVxuICAgICAgfSksXG4gICAgICBPYnNlcnZhYmxlLmZyb21Qcm9taXNlKHRoaXMucHJvcHMuYWxsb3dMb2dNZXNzYWdlKS5zdWJzY3JpYmUoKGFsbG93TG9nTWVzc2FnZSkgPT4ge1xuICAgICAgICB0aGlzLnNldFN0YXRlKHsgYWxsb3dMb2dNZXNzYWdlIH0pXG4gICAgICB9KVxuICAgIClcbiAgfVxuXG4gIGNvbXBvbmVudERpZE1vdW50KCk6IHZvaWQge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9CUkVBS1BPSU5UX0NPTkZJR19VSV9TSE9XLCB7XG4gICAgICBmaWxlRXh0ZW5zaW9uOiBudWNsaWRlVXJpLmV4dG5hbWUodGhpcy5wcm9wcy5icmVha3BvaW50LnVyaSksXG4gICAgfSlcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIFwiY29yZTpjYW5jZWxcIiwgdGhpcy5wcm9wcy5vbkRpc21pc3MpLFxuICAgICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCBcImNvcmU6Y29uZmlybVwiLCB0aGlzLl91cGRhdGVCcmVha3BvaW50LmJpbmQodGhpcykpLFxuICAgICAgT2JzZXJ2YWJsZS50aW1lcigxMDApLnN1YnNjcmliZSgoKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLl9jb25kaXRpb25JbnB1dC5jdXJyZW50ICE9IG51bGwpIHtcbiAgICAgICAgICB0aGlzLl9jb25kaXRpb25JbnB1dC5jdXJyZW50LmZvY3VzKClcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApXG4gIH1cblxuICBjb21wb25lbnRXaWxsVW5tb3VudCgpOiB2b2lkIHtcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIGFzeW5jIF91cGRhdGVCcmVha3BvaW50KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHsgYnJlYWtwb2ludCwgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xuICAgIGNvbnN0IHsgZW5hYmxlZENoZWNrZWQgfSA9IHRoaXMuc3RhdGVcbiAgICBzZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKGVuYWJsZWRDaGVja2VkLCB0aGlzLnByb3BzLmJyZWFrcG9pbnQpXG4gICAgY29uc3QgY29uZGl0aW9uID0gdGhpcy5zdGF0ZS5jb25kaXRpb24udHJpbSgpXG4gICAgY29uc3QgbG9nTWVzc2FnZSA9IHRoaXMuc3RhdGUubG9nTWVzc2FnZS50cmltKClcbiAgICBpZiAoY29uZGl0aW9uID09PSAoYnJlYWtwb2ludC5jb25kaXRpb24gPz8gXCJcIikgJiYgY29uZGl0aW9uID09PSAoYnJlYWtwb2ludC5sb2dNZXNzYWdlID8/IFwiXCIpKSB7XG4gICAgICB0aGlzLnByb3BzLm9uRGlzbWlzcygpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBhd2FpdCBzZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKGJyZWFrcG9pbnQuZ2V0SWQoKSlcblxuICAgIGNvbnN0IGJwOiBJVUlCcmVha3BvaW50ID0ge1xuICAgICAgbGluZTogYnJlYWtwb2ludC5saW5lLFxuICAgICAgY29sdW1uOiBicmVha3BvaW50LmNvbHVtbixcbiAgICAgIGVuYWJsZWQ6IGJyZWFrcG9pbnQuZW5hYmxlZCxcbiAgICAgIGlkOiBicmVha3BvaW50LmdldElkKCksXG4gICAgICB1cmk6IGJyZWFrcG9pbnQudXJpLFxuICAgIH1cbiAgICBpZiAoY29uZGl0aW9uICE9PSBcIlwiKSB7XG4gICAgICBicC5jb25kaXRpb24gPSBjb25kaXRpb25cbiAgICB9XG4gICAgaWYgKGxvZ01lc3NhZ2UgIT09IFwiXCIpIHtcbiAgICAgIGJwLmxvZ01lc3NhZ2UgPSBsb2dNZXNzYWdlXG4gICAgfVxuXG4gICAgYXdhaXQgc2VydmljZS5hZGRVSUJyZWFrcG9pbnRzKFticF0pXG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX0JSRUFLUE9JTlRfVVBEQVRFX0NPTkRJVElPTiwge1xuICAgICAgcGF0aDogYnJlYWtwb2ludC51cmksXG4gICAgICBsaW5lOiBicmVha3BvaW50LmxpbmUsXG4gICAgICBjb25kaXRpb24sXG4gICAgICBsb2dNZXNzYWdlLFxuICAgICAgZmlsZUV4dGVuc2lvbjogbnVjbGlkZVVyaS5leHRuYW1lKGJyZWFrcG9pbnQudXJpKSxcbiAgICB9KVxuICAgIHRoaXMucHJvcHMub25EaXNtaXNzKClcbiAgfVxuXG4gIF9yZW5kZXJMb2dNZXNzYWdlKCk6ID9SZWFjdC5Ob2RlIHtcbiAgICBpZiAoIXRoaXMuc3RhdGUuYWxsb3dMb2dNZXNzYWdlKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiAoXG4gICAgICA8PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJsb2NrXCI+XG4gICAgICAgICAgPEF0b21JbnB1dFxuICAgICAgICAgICAgcGxhY2Vob2xkZXJUZXh0PVwiQnJlYWtwb2ludCBsb2cgbWVzc2FnZS4uLlwiXG4gICAgICAgICAgICB2YWx1ZT17dGhpcy5zdGF0ZS5sb2dNZXNzYWdlfVxuICAgICAgICAgICAgc2l6ZT1cInNtXCJcbiAgICAgICAgICAgIG9uRGlkQ2hhbmdlPXsodmFsdWUpID0+IHRoaXMuc2V0U3RhdGUoeyBsb2dNZXNzYWdlOiB2YWx1ZSB9KX1cbiAgICAgICAgICAvPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGxhYmVsPlxuICAgICAgICAgIFRoaXMgbWVzc2FnZSB3aWxsIGJlIGxvZ2dlZCB0byB0aGUgTnVjbGlkZSBjb25zb2xlIGVhY2ggdGltZSB0aGUgY29ycmVzcG9uZGluZyBsaW5lIGlzIGhpdC4gVGhlIG1lc3NhZ2UgY2FuIGJlXG4gICAgICAgICAgaW50ZXJwb2xhdGVkIHdpdGggZXhwcmVzc2lvbnMgYnkgdXNpbmcgY3VybHkgYnJhY2VzLiBFeGFtcGxlOiBcIkNvdW50ZXI6IHtcIntjb3VudGVyfVwifVwiLlxuICAgICAgICA8L2xhYmVsPlxuICAgICAgPC8+XG4gICAgKVxuICB9XG5cbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xuICAgIHJldHVybiAoXG4gICAgICA8TW9kYWwgb25EaXNtaXNzPXt0aGlzLnByb3BzLm9uRGlzbWlzc30+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicGFkZGVkIGRlYnVnZ2VyLWJwLWRpYWxvZ1wiPlxuICAgICAgICAgIDxoMSBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icC1jb25maWctaGVhZGVyXCI+RWRpdCBicmVha3BvaW50PC9oMT5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJsb2NrXCI+XG4gICAgICAgICAgICA8bGFiZWw+XG4gICAgICAgICAgICAgIEJyZWFrcG9pbnQgYXQge251Y2xpZGVVcmkuYmFzZW5hbWUodGhpcy5wcm9wcy5icmVha3BvaW50LnVyaSl9Ont0aGlzLnByb3BzLmJyZWFrcG9pbnQubGluZX1cbiAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJibG9ja1wiPlxuICAgICAgICAgICAgPENoZWNrYm94XG4gICAgICAgICAgICAgIG9uQ2hhbmdlPXsoaXNDaGVja2VkKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX0JSRUFLUE9JTlRfVE9HR0xFX0VOQUJMRUQsIHtcbiAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGlzQ2hlY2tlZCxcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgICAgICAgICAgICAgZW5hYmxlZENoZWNrZWQ6IGlzQ2hlY2tlZCxcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICBjaGVja2VkPXt0aGlzLnN0YXRlLmVuYWJsZWRDaGVja2VkfVxuICAgICAgICAgICAgICBsYWJlbD1cIkVuYWJsZSBicmVha3BvaW50XCJcbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJibG9ja1wiPlxuICAgICAgICAgICAgPEF0b21JbnB1dFxuICAgICAgICAgICAgICBwbGFjZWhvbGRlclRleHQ9XCJCcmVha3BvaW50IGhpdCBjb25kaXRpb24uLi5cIlxuICAgICAgICAgICAgICB2YWx1ZT17dGhpcy5zdGF0ZS5jb25kaXRpb259XG4gICAgICAgICAgICAgIHNpemU9XCJzbVwiXG4gICAgICAgICAgICAgIHJlZj17dGhpcy5fY29uZGl0aW9uSW5wdXR9XG4gICAgICAgICAgICAgIGF1dG9mb2N1cz17dHJ1ZX1cbiAgICAgICAgICAgICAgb25EaWRDaGFuZ2U9eyh2YWx1ZSkgPT4gdGhpcy5zZXRTdGF0ZSh7IGNvbmRpdGlvbjogdmFsdWUgfSl9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDxsYWJlbD5cbiAgICAgICAgICAgIFRoaXMgZXhwcmVzc2lvbiB3aWxsIGJlIGV2YWx1YXRlZCBlYWNoIHRpbWUgdGhlIGNvcnJlc3BvbmRpbmcgbGluZSBpcyBoaXQsIGJ1dCB0aGUgZGVidWdnZXIgd2lsbCBvbmx5IGJyZWFrXG4gICAgICAgICAgICBleGVjdXRpb24gaWYgdGhlIGV4cHJlc3Npb24gZXZhbHVhdGVzIHRvIHRydWUuXG4gICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICB7dGhpcy5fcmVuZGVyTG9nTWVzc2FnZSgpfVxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItYnAtY29uZmlnLWFjdGlvbnNcIj5cbiAgICAgICAgICAgIDxCdXR0b25Hcm91cD5cbiAgICAgICAgICAgICAgPEJ1dHRvbiBvbkNsaWNrPXt0aGlzLnByb3BzLm9uRGlzbWlzc30+Q2FuY2VsPC9CdXR0b24+XG4gICAgICAgICAgICAgIDxCdXR0b24gYnV0dG9uVHlwZT17QnV0dG9uVHlwZXMuUFJJTUFSWX0gb25DbGljaz17dGhpcy5fdXBkYXRlQnJlYWtwb2ludC5iaW5kKHRoaXMpfT5cbiAgICAgICAgICAgICAgICBVcGRhdGVcbiAgICAgICAgICAgICAgPC9CdXR0b24+XG4gICAgICAgICAgICA8L0J1dHRvbkdyb3VwPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvTW9kYWw+XG4gICAgKVxuICB9XG59XG4iXX0=