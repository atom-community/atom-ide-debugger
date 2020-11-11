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

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

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
    }), _rxjsCompatUmdMin.Observable.fromPromise(this.props.allowLogMessage).subscribe(allowLogMessage => {
      this.setState({
        allowLogMessage
      });
    }));
  }

  componentDidMount() {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_BREAKPOINT_CONFIG_UI_SHOW, {
      fileExtension: _nuclideUri.default.extname(this.props.breakpoint.uri)
    });

    this._disposables.add(atom.commands.add("atom-workspace", "core:cancel", this.props.onDismiss), atom.commands.add("atom-workspace", "core:confirm", this._updateBreakpoint.bind(this)), _rxjsCompatUmdMin.Observable.timer(100).subscribe(() => {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyZWFrcG9pbnRDb25maWdDb21wb25lbnQuanMiXSwibmFtZXMiOlsiQnJlYWtwb2ludENvbmZpZ0NvbXBvbmVudCIsIlJlYWN0IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJwcm9wcyIsIl9jb25kaXRpb25JbnB1dCIsInN0YXRlIiwiX2Rpc3Bvc2FibGVzIiwiVW5pdmVyc2FsRGlzcG9zYWJsZSIsImNyZWF0ZVJlZiIsImJwSWQiLCJicmVha3BvaW50IiwiZ2V0SWQiLCJlbmFibGVkQ2hlY2tlZCIsImVuYWJsZWQiLCJjb25kaXRpb24iLCJsb2dNZXNzYWdlIiwiYWxsb3dMb2dNZXNzYWdlIiwibW9kZWwiLCJzZXJ2aWNlIiwiZ2V0TW9kZWwiLCJhZGQiLCJvbkRpZENoYW5nZUJyZWFrcG9pbnRzIiwiZ2V0QnJlYWtwb2ludHMiLCJmaWx0ZXIiLCJicCIsIm9uRGlzbWlzcyIsImZvcmNlVXBkYXRlIiwiT2JzZXJ2YWJsZSIsImZyb21Qcm9taXNlIiwic3Vic2NyaWJlIiwic2V0U3RhdGUiLCJjb21wb25lbnREaWRNb3VudCIsIkFuYWx5dGljc0V2ZW50cyIsIkRFQlVHR0VSX0JSRUFLUE9JTlRfQ09ORklHX1VJX1NIT1ciLCJmaWxlRXh0ZW5zaW9uIiwibnVjbGlkZVVyaSIsImV4dG5hbWUiLCJ1cmkiLCJhdG9tIiwiY29tbWFuZHMiLCJfdXBkYXRlQnJlYWtwb2ludCIsImJpbmQiLCJ0aW1lciIsImN1cnJlbnQiLCJmb2N1cyIsImNvbXBvbmVudFdpbGxVbm1vdW50IiwiZGlzcG9zZSIsImVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzIiwidHJpbSIsInJlbW92ZUJyZWFrcG9pbnRzIiwibGluZSIsImNvbHVtbiIsImlkIiwiYWRkVUlCcmVha3BvaW50cyIsIkRFQlVHR0VSX0JSRUFLUE9JTlRfVVBEQVRFX0NPTkRJVElPTiIsInBhdGgiLCJfcmVuZGVyTG9nTWVzc2FnZSIsInZhbHVlIiwicmVuZGVyIiwiYmFzZW5hbWUiLCJpc0NoZWNrZWQiLCJERUJVR0dFUl9CUkVBS1BPSU5UX1RPR0dMRV9FTkFCTEVEIiwiQnV0dG9uVHlwZXMiLCJQUklNQVJZIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBaUJlLE1BQU1BLHlCQUFOLFNBQXdDQyxLQUFLLENBQUNDLFNBQTlDLENBQThFO0FBTTNGQyxFQUFBQSxXQUFXLENBQUNDLEtBQUQsRUFBbUI7QUFBQTs7QUFDNUIsVUFBTUEsS0FBTjtBQUQ0QixTQUw5QkMsZUFLOEI7QUFBQSxTQUo5QkQsS0FJOEI7QUFBQSxTQUg5QkUsS0FHOEI7QUFBQSxTQUY5QkMsWUFFOEI7QUFFNUIsU0FBS0EsWUFBTCxHQUFvQixJQUFJQyw0QkFBSixFQUFwQjtBQUNBLFNBQUtILGVBQUwsZ0JBQXVCSixLQUFLLENBQUNRLFNBQU4sRUFBdkI7QUFDQSxTQUFLSCxLQUFMLEdBQWE7QUFDWEksTUFBQUEsSUFBSSxFQUFFLEtBQUtOLEtBQUwsQ0FBV08sVUFBWCxDQUFzQkMsS0FBdEIsRUFESztBQUVYQyxNQUFBQSxjQUFjLEVBQUUsS0FBS1QsS0FBTCxDQUFXTyxVQUFYLENBQXNCRyxPQUYzQjtBQUdYQyxNQUFBQSxTQUFTLDJCQUFFLEtBQUtYLEtBQUwsQ0FBV08sVUFBWCxDQUFzQkksU0FBeEIseUVBQXFDLEVBSG5DO0FBSVhDLE1BQUFBLFVBQVUsNEJBQUUsS0FBS1osS0FBTCxDQUFXTyxVQUFYLENBQXNCSyxVQUF4QiwyRUFBc0MsRUFKckM7QUFLWEMsTUFBQUEsZUFBZSxFQUFFO0FBTE4sS0FBYjtBQVFBLFVBQU1DLEtBQUssR0FBRyxLQUFLZCxLQUFMLENBQVdlLE9BQVgsQ0FBbUJDLFFBQW5CLEVBQWQ7O0FBQ0EsU0FBS2IsWUFBTCxDQUFrQmMsR0FBbEIsQ0FDRUgsS0FBSyxDQUFDSSxzQkFBTixDQUE2QixNQUFNO0FBQ2pDLFlBQU1YLFVBQVUsR0FBR08sS0FBSyxDQUFDSyxjQUFOLEdB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QUFBSyxNQUFBLFNBQVMsRUFBQztBQUFmLG9CQUNFLG9CQUFDLHdCQUFELHFCQUNFLG9CQUFDLGNBQUQ7QUFBUSxNQUFBLE9BQU8sRUFBRSxLQUFLckQsS0FBTCxDQUFXc0I7QUFBNUIsZ0JBREYsZUFFRSxvQkFBQyxjQUFEO0FBQVEsTUFBQSxVQUFVLEVBQUVxQyxvQkFBWUMsT0FBaEM7QUFBeUMsTUFBQSxPQUFPLEVBQUUsS0FBS3ZCLGlCQUFMLENBQXVCQyxJQUF2QixDQUE0QixJQUE1QjtBQUFsRCxnQkFGRixDQURGLENBcENGLENBREYsQ0FERjtBQWlERDs7QUFwSzBGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBJQnJlYWtwb2ludCwgSVVJQnJlYWtwb2ludCwgSURlYnVnU2VydmljZSB9IGZyb20gXCIuLi90eXBlc1wiXHJcblxyXG5pbXBvcnQgeyBBdG9tSW5wdXQgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvQXRvbUlucHV0XCJcclxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcclxuaW1wb3J0IHsgQnV0dG9uLCBCdXR0b25UeXBlcyB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9CdXR0b25cIlxyXG5pbXBvcnQgeyBCdXR0b25Hcm91cCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9CdXR0b25Hcm91cFwiXHJcbmltcG9ydCBudWNsaWRlVXJpIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9udWNsaWRlVXJpXCJcclxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxyXG5pbXBvcnQgeyBDaGVja2JveCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9DaGVja2JveFwiXHJcbmltcG9ydCB7IE1vZGFsIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL01vZGFsXCJcclxuaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gXCJyeGpzLWNvbXBhdC9idW5kbGVzL3J4anMtY29tcGF0LnVtZC5taW4uanNcIlxyXG5pbXBvcnQgeyB0cmFjayB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9hbmFseXRpY3NcIlxyXG5pbXBvcnQgeyBBbmFseXRpY3NFdmVudHMgfSBmcm9tIFwiLi4vY29uc3RhbnRzXCJcclxuXHJcbnR5cGUgUHJvcHNUeXBlID0ge1xyXG4gIG9uRGlzbWlzczogKCkgPT4gdm9pZCxcclxuICBicmVha3BvaW50OiBJQnJlYWtwb2ludCxcclxuICBzZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxyXG4gIGFsbG93TG9nTWVzc2FnZTogUHJvbWlzZTxib29sZWFuPixcclxufVxyXG5cclxudHlwZSBTdGF0ZVR5cGUgPSB7XHJcbiAgYnBJZDogc3RyaW5nLFxyXG4gIGVuYWJsZWRDaGVja2VkOiBib29sZWFuLFxyXG4gIGNvbmRpdGlvbjogc3RyaW5nLFxyXG4gIGxvZ01lc3NhZ2U6IHN0cmluZyxcclxuICBhbGxvd0xvZ01lc3NhZ2U6IGJvb2xlYW4sXHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEJyZWFrcG9pbnRDb25maWdDb21wb25lbnQgZXh0ZW5kcyBSZWFjdC5Db21wb25lbnQ8UHJvcHNUeXBlLCBTdGF0ZVR5cGU+IHtcclxuICBfY29uZGl0aW9uSW5wdXQ6IFJlYWN0Q29tcG9uZW50UmVmPEF0b21JbnB1dD5cclxuICBwcm9wczogUHJvcHNUeXBlXHJcbiAgc3RhdGU6IFN0YXRlVHlwZVxyXG4gIF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxyXG5cclxuICBjb25zdHJ1Y3Rvcihwcm9wczogUHJvcHNUeXBlKSB7XHJcbiAgICBzdXBlcihwcm9wcylcclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxyXG4gICAgdGhpcy5fY29uZGl0aW9uSW5wdXQgPSBSZWFjdC5jcmVhdGVSZWYoKVxyXG4gICAgdGhpcy5zdGF0ZSA9IHtcclxuICAgICAgYnBJZDogdGhpcy5wcm9wcy5icmVha3BvaW50LmdldElkKCksXHJcbiAgICAgIGVuYWJsZWRDaGVja2VkOiB0aGlzLnByb3BzLmJyZWFrcG9pbnQuZW5hYmxlZCxcclxuICAgICAgY29uZGl0aW9uOiB0aGlzLnByb3BzLmJyZWFrcG9pbnQuY29uZGl0aW9uID8/IFwiXCIsXHJcbiAgICAgIGxvZ01lc3NhZ2U6IHRoaXMucHJvcHMuYnJlYWtwb2ludC5sb2dNZXNzYWdlID8/IFwiXCIsXHJcbiAgICAgIGFsbG93TG9nTWVzc2FnZTogZmFsc2UsXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbW9kZWwgPSB0aGlzLnByb3BzLnNlcnZpY2UuZ2V0TW9kZWwoKVxyXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxyXG4gICAgICBtb2RlbC5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKCgpID0+IHtcclxuICAgICAgICBjb25zdCBicmVha3BvaW50ID0gbW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5maWx0ZXIoKGJwKSA9PiBicC5nZXRJZCgpID09PSB0aGlzLnN0YXRlLmJwSWQpXHJcbiAgICAgICAgaWYgKGJyZWFrcG9pbnQgPT0gbnVsbCkge1xyXG4gICAgICAgICAgLy8gQnJlYWtwb2ludCBubyBsb25nZXIgZXhpc3RzLlxyXG4gICAgICAgICAgdGhpcy5wcm9wcy5vbkRpc21pc3MoKVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmZvcmNlVXBkYXRlKClcclxuICAgICAgfSksXHJcbiAgICAgIE9ic2VydmFibGUuZnJvbVByb21pc2UodGhpcy5wcm9wcy5hbGxvd0xvZ01lc3NhZ2UpLnN1YnNjcmliZSgoYWxsb3dMb2dNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0ZSh7IGFsbG93TG9nTWVzc2FnZSB9KVxyXG4gICAgICB9KVxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgY29tcG9uZW50RGlkTW91bnQoKTogdm9pZCB7XHJcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfQlJFQUtQT0lOVF9DT05GSUdfVUlfU0hPVywge1xyXG4gICAgICBmaWxlRXh0ZW5zaW9uOiBudWNsaWRlVXJpLmV4dG5hbWUodGhpcy5wcm9wcy5icmVha3BvaW50LnVyaSksXHJcbiAgICB9KVxyXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxyXG4gICAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIFwiY29yZTpjYW5jZWxcIiwgdGhpcy5wcm9wcy5vbkRpc21pc3MpLFxyXG4gICAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIFwiY29yZTpjb25maXJtXCIsIHRoaXMuX3VwZGF0ZUJyZWFrcG9pbnQuYmluZCh0aGlzKSksXHJcbiAgICAgIE9ic2VydmFibGUudGltZXIoMTAwKS5zdWJzY3JpYmUoKCkgPT4ge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb25kaXRpb25JbnB1dC5jdXJyZW50ICE9IG51bGwpIHtcclxuICAgICAgICAgIHRoaXMuX2NvbmRpdGlvbklucHV0LmN1cnJlbnQuZm9jdXMoKVxyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgIClcclxuICB9XHJcblxyXG4gIGNvbXBvbmVudFdpbGxVbm1vdW50KCk6IHZvaWQge1xyXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpXHJcbiAgfVxyXG5cclxuICBhc3luYyBfdXBkYXRlQnJlYWtwb2ludCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHsgYnJlYWtwb2ludCwgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xyXG4gICAgY29uc3QgeyBlbmFibGVkQ2hlY2tlZCB9ID0gdGhpcy5zdGF0ZVxyXG4gICAgc2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyhlbmFibGVkQ2hlY2tlZCwgdGhpcy5wcm9wcy5icmVha3BvaW50KVxyXG4gICAgY29uc3QgY29uZGl0aW9uID0gdGhpcy5zdGF0ZS5jb25kaXRpb24udHJpbSgpXHJcbiAgICBjb25zdCBsb2dNZXNzYWdlID0gdGhpcy5zdGF0ZS5sb2dNZXNzYWdlLnRyaW0oKVxyXG4gICAgaWYgKGNvbmRpdGlvbiA9PT0gKGJyZWFrcG9pbnQuY29uZGl0aW9uID8/IFwiXCIpICYmIGNvbmRpdGlvbiA9PT0gKGJyZWFrcG9pbnQubG9nTWVzc2FnZSA/PyBcIlwiKSkge1xyXG4gICAgICB0aGlzLnByb3BzLm9uRGlzbWlzcygpXHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnJlYWtwb2ludC5nZXRJZCgpKVxyXG5cclxuICAgIGNvbnN0IGJwOiBJVUlCcmVha3BvaW50ID0ge1xyXG4gICAgICBsaW5lOiBicmVha3BvaW50LmxpbmUsXHJcbiAgICAgIGNvbHVtbjogYnJlYWtwb2ludC5jb2x1bW4sXHJcbiAgICAgIGVuYWJsZWQ6IGJyZWFrcG9pbnQuZW5hYmxlZCxcclxuICAgICAgaWQ6IGJyZWFrcG9pbnQuZ2V0SWQoKSxcclxuICAgICAgdXJpOiBicmVha3BvaW50LnVyaSxcclxuICAgIH1cclxuICAgIGlmIChjb25kaXRpb24gIT09IFwiXCIpIHtcclxuICAgICAgYnAuY29uZGl0aW9uID0gY29uZGl0aW9uXHJcbiAgICB9XHJcbiAgICBpZiAobG9nTWVzc2FnZSAhPT0gXCJcIikge1xyXG4gICAgICBicC5sb2dNZXNzYWdlID0gbG9nTWVzc2FnZVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNlcnZpY2UuYWRkVUlCcmVha3BvaW50cyhbYnBdKVxyXG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX0JSRUFLUE9JTlRfVVBEQVRFX0NPTkRJVElPTiwge1xyXG4gICAgICBwYXRoOiBicmVha3BvaW50LnVyaSxcclxuICAgICAgbGluZTogYnJlYWtwb2ludC5saW5lLFxyXG4gICAgICBjb25kaXRpb24sXHJcbiAgICAgIGxvZ01lc3NhZ2UsXHJcbiAgICAgIGZpbGVFeHRlbnNpb246IG51Y2xpZGVVcmkuZXh0bmFtZShicmVha3BvaW50LnVyaSksXHJcbiAgICB9KVxyXG4gICAgdGhpcy5wcm9wcy5vbkRpc21pc3MoKVxyXG4gIH1cclxuXHJcbiAgX3JlbmRlckxvZ01lc3NhZ2UoKTogP1JlYWN0Lk5vZGUge1xyXG4gICAgaWYgKCF0aGlzLnN0YXRlLmFsbG93TG9nTWVzc2FnZSkge1xyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiAoXHJcbiAgICAgIDw+XHJcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJibG9ja1wiPlxyXG4gICAgICAgICAgPEF0b21JbnB1dFxyXG4gICAgICAgICAgICBwbGFjZWhvbGRlclRleHQ9XCJCcmVha3BvaW50IGxvZyBtZXNzYWdlLi4uXCJcclxuICAgICAgICAgICAgdmFsdWU9e3RoaXMuc3RhdGUubG9nTWVzc2FnZX1cclxuICAgICAgICAgICAgc2l6ZT1cInNtXCJcclxuICAgICAgICAgICAgb25EaWRDaGFuZ2U9eyh2YWx1ZSkgPT4gdGhpcy5zZXRTdGF0ZSh7IGxvZ01lc3NhZ2U6IHZhbHVlIH0pfVxyXG4gICAgICAgICAgLz5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8bGFiZWw+XHJcbiAgICAgICAgICBUaGlzIG1lc3NhZ2Ugd2lsbCBiZSBsb2dnZWQgdG8gdGhlIE51Y2xpZGUgY29uc29sZSBlYWNoIHRpbWUgdGhlIGNvcnJlc3BvbmRpbmcgbGluZSBpcyBoaXQuIFRoZSBtZXNzYWdlIGNhbiBiZVxyXG4gICAgICAgICAgaW50ZXJwb2xhdGVkIHdpdGggZXhwcmVzc2lvbnMgYnkgdXNpbmcgY3VybHkgYnJhY2VzLiBFeGFtcGxlOiBcIkNvdW50ZXI6IHtcIntjb3VudGVyfVwifVwiLlxyXG4gICAgICAgIDwvbGFiZWw+XHJcbiAgICAgIDwvPlxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xyXG4gICAgcmV0dXJuIChcclxuICAgICAgPE1vZGFsIG9uRGlzbWlzcz17dGhpcy5wcm9wcy5vbkRpc21pc3N9PlxyXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicGFkZGVkIGRlYnVnZ2VyLWJwLWRpYWxvZ1wiPlxyXG4gICAgICAgICAgPGgxIGNsYXNzTmFtZT1cImRlYnVnZ2VyLWJwLWNvbmZpZy1oZWFkZXJcIj5FZGl0IGJyZWFrcG9pbnQ8L2gxPlxyXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJibG9ja1wiPlxyXG4gICAgICAgICAgICA8bGFiZWw+XHJcbiAgICAgICAgICAgICAgQnJlYWtwb2ludCBhdCB7bnVjbGlkZVVyaS5iYXNlbmFtZSh0aGlzLnByb3BzLmJyZWFrcG9pbnQudXJpKX06e3RoaXMucHJvcHMuYnJlYWtwb2ludC5saW5lfVxyXG4gICAgICAgICAgICA8L2xhYmVsPlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJsb2NrXCI+XHJcbiAgICAgICAgICAgIDxDaGVja2JveFxyXG4gICAgICAgICAgICAgIG9uQ2hhbmdlPXsoaXNDaGVja2VkKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfQlJFQUtQT0lOVF9UT0dHTEVfRU5BQkxFRCwge1xyXG4gICAgICAgICAgICAgICAgICBlbmFibGVkOiBpc0NoZWNrZWQsXHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0ZSh7XHJcbiAgICAgICAgICAgICAgICAgIGVuYWJsZWRDaGVja2VkOiBpc0NoZWNrZWQsXHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgIH19XHJcbiAgICAgICAgICAgICAgY2hlY2tlZD17dGhpcy5zdGF0ZS5lbmFibGVkQ2hlY2tlZH1cclxuICAgICAgICAgICAgICBsYWJlbD1cIkVuYWJsZSBicmVha3BvaW50XCJcclxuICAgICAgICAgICAgLz5cclxuICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJibG9ja1wiPlxyXG4gICAgICAgICAgICA8QXRvbUlucHV0XHJcbiAgICAgICAgICAgICAgcGxhY2Vob2xkZXJUZXh0PVwiQnJlYWtwb2ludCBoaXQgY29uZGl0aW9uLi4uXCJcclxuICAgICAgICAgICAgICB2YWx1ZT17dGhpcy5zdGF0ZS5jb25kaXRpb259XHJcbiAgICAgICAgICAgICAgc2l6ZT1cInNtXCJcclxuICAgICAgICAgICAgICByZWY9e3RoaXMuX2NvbmRpdGlvbklucHV0fVxyXG4gICAgICAgICAgICAgIGF1dG9mb2N1cz17dHJ1ZX1cclxuICAgICAgICAgICAgICBvbkRpZENoYW5nZT17KHZhbHVlKSA9PiB0aGlzLnNldFN0YXRlKHsgY29uZGl0aW9uOiB2YWx1ZSB9KX1cclxuICAgICAgICAgICAgLz5cclxuICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgPGxhYmVsPlxyXG4gICAgICAgICAgICBUaGlzIGV4cHJlc3Npb24gd2lsbCBiZSBldmFsdWF0ZWQgZWFjaCB0aW1lIHRoZSBjb3JyZXNwb25kaW5nIGxpbmUgaXMgaGl0LCBidXQgdGhlIGRlYnVnZ2VyIHdpbGwgb25seSBicmVha1xyXG4gICAgICAgICAgICBleGVjdXRpb24gaWYgdGhlIGV4cHJlc3Npb24gZXZhbHVhdGVzIHRvIHRydWUuXHJcbiAgICAgICAgICA8L2xhYmVsPlxyXG4gICAgICAgICAge3RoaXMuX3JlbmRlckxvZ01lc3NhZ2UoKX1cclxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItYnAtY29uZmlnLWFjdGlvbnNcIj5cclxuICAgICAgICAgICAgPEJ1dHRvbkdyb3VwPlxyXG4gICAgICAgICAgICAgIDxCdXR0b24gb25DbGljaz17dGhpcy5wcm9wcy5vbkRpc21pc3N9PkNhbmNlbDwvQnV0dG9uPlxyXG4gICAgICAgICAgICAgIDxCdXR0b24gYnV0dG9uVHlwZT17QnV0dG9uVHlwZXMuUFJJTUFSWX0gb25DbGljaz17dGhpcy5fdXBkYXRlQnJlYWtwb2ludC5iaW5kKHRoaXMpfT5cclxuICAgICAgICAgICAgICAgIFVwZGF0ZVxyXG4gICAgICAgICAgICAgIDwvQnV0dG9uPlxyXG4gICAgICAgICAgICA8L0J1dHRvbkdyb3VwPlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgIDwvTW9kYWw+XHJcbiAgICApXHJcbiAgfVxyXG59XHJcbiJdfQ==