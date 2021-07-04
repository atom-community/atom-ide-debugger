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

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyZWFrcG9pbnRDb25maWdDb21wb25lbnQuanMiXSwibmFtZXMiOlsiQnJlYWtwb2ludENvbmZpZ0NvbXBvbmVudCIsIlJlYWN0IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJwcm9wcyIsIl9jb25kaXRpb25JbnB1dCIsInN0YXRlIiwiX2Rpc3Bvc2FibGVzIiwiVW5pdmVyc2FsRGlzcG9zYWJsZSIsImNyZWF0ZVJlZiIsImJwSWQiLCJicmVha3BvaW50IiwiZ2V0SWQiLCJlbmFibGVkQ2hlY2tlZCIsImVuYWJsZWQiLCJjb25kaXRpb24iLCJsb2dNZXNzYWdlIiwiYWxsb3dMb2dNZXNzYWdlIiwibW9kZWwiLCJzZXJ2aWNlIiwiZ2V0TW9kZWwiLCJhZGQiLCJvbkRpZENoYW5nZUJyZWFrcG9pbnRzIiwiZ2V0QnJlYWtwb2ludHMiLCJmaWx0ZXIiLCJicCIsIm9uRGlzbWlzcyIsImZvcmNlVXBkYXRlIiwiT2JzZXJ2YWJsZSIsImZyb21Qcm9taXNlIiwic3Vic2NyaWJlIiwic2V0U3RhdGUiLCJjb21wb25lbnREaWRNb3VudCIsIkFuYWx5dGljc0V2ZW50cyIsIkRFQlVHR0VSX0JSRUFLUE9JTlRfQ09ORklHX1VJX1NIT1ciLCJmaWxlRXh0ZW5zaW9uIiwibnVjbGlkZVVyaSIsImV4dG5hbWUiLCJ1cmkiLCJhdG9tIiwiY29tbWFuZHMiLCJfdXBkYXRlQnJlYWtwb2ludCIsImJpbmQiLCJ0aW1lciIsImN1cnJlbnQiLCJmb2N1cyIsImNvbXBvbmVudFdpbGxVbm1vdW50IiwiZGlzcG9zZSIsImVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzIiwidHJpbSIsInJlbW92ZUJyZWFrcG9pbnRzIiwibGluZSIsImNvbHVtbiIsImlkIiwiYWRkVUlCcmVha3BvaW50cyIsIkRFQlVHR0VSX0JSRUFLUE9JTlRfVVBEQVRFX0NPTkRJVElPTiIsInBhdGgiLCJfcmVuZGVyTG9nTWVzc2FnZSIsInZhbHVlIiwicmVuZGVyIiwiYmFzZW5hbWUiLCJpc0NoZWNrZWQiLCJERUJVR0dFUl9CUkVBS1BPSU5UX1RPR0dMRV9FTkFCTEVEIiwiQnV0dG9uVHlwZXMiLCJQUklNQVJZIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBaUJlLE1BQU1BLHlCQUFOLFNBQXdDQyxLQUFLLENBQUNDLFNBQTlDLENBQThFO0FBTTNGQyxFQUFBQSxXQUFXLENBQUNDLEtBQUQsRUFBbUI7QUFBQTs7QUFDNUIsVUFBTUEsS0FBTjtBQUQ0QixTQUw5QkMsZUFLOEI7QUFBQSxTQUo5QkQsS0FJOEI7QUFBQSxTQUg5QkUsS0FHOEI7QUFBQSxTQUY5QkMsWUFFOEI7QUFFNUIsU0FBS0EsWUFBTCxHQUFvQixJQUFJQyw0QkFBSixFQUFwQjtBQUNBLFNBQUtILGVBQUwsZ0JBQXVCSixLQUFLLENBQUNRLFNBQU4sRUFBdkI7QUFDQSxTQUFLSCxLQUFMLEdBQWE7QUFDWEksTUFBQUEsSUFBSSxFQUFFLEtBQUtOLEtBQUwsQ0FBV08sVUFBWCxDQUFzQkMsS0FBdEIsRUFESztBQUVYQyxNQUFBQSxjQUFjLEVBQUUsS0FBS1QsS0FBTCxDQUFXTyxVQUFYLENBQXNCRyxPQUYzQjtBQUdYQyxNQUFBQSxTQUFTLDJCQUFFLEtBQUtYLEtBQUwsQ0FBV08sVUFBWCxDQUFzQkksU0FBeEIseUVBQXFDLEVBSG5DO0FBSVhDLE1BQUFBLFVBQVUsNEJBQUUsS0FBS1osS0FBTCxDQUFXTyxVQUFYLENBQXNCSyxVQUF4QiwyRUFBc0MsRUFKckM7QUFLWEMsTUFBQUEsZUFBZSxFQUFFO0FBTE4sS0FBYjtBQVFBLFVBQU1DLEtBQUssR0FBRyxLQUFLZCxLQUFMLENBQVdlLE9BQVgsQ0FBbUJDLFFBQW5CLEVBQWQ7O0FBQ0EsU0FBS2IsWUFBTCxDQUFrQmMsR0FBbEIsQ0FDRUgsS0FBSyxDQUFDSSxzQkFBTixDQUE2QixNQUFNO0FBQ2pDLFlBQU1YLFVBQVUsR0FBR08sS0FBSyxDQUFDSyxjQUFOLEdB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Q0U7QUFBSyxNQUFBLFNBQVMsRUFBQztBQUFmLG9CQUNFLG9CQUFDLHdCQUFELHFCQUNFLG9CQUFDLGNBQUQ7QUFBUSxNQUFBLE9BQU8sRUFBRSxLQUFLckQsS0FBTCxDQUFXc0I7QUFBNUIsZ0JBREYsZUFFRSxvQkFBQyxjQUFEO0FBQVEsTUFBQSxVQUFVLEVBQUVxQyxvQkFBWUMsT0FBaEM7QUFBeUMsTUFBQSxPQUFPLEVBQUUsS0FBS3ZCLGlCQUFMLENBQXVCQyxJQUF2QixDQUE0QixJQUE1QjtBQUFsRCxnQkFGRixDQURGLENBcENGLENBREYsQ0FERjtBQWlERDs7QUFwSzBGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBJQnJlYWtwb2ludCwgSVVJQnJlYWtwb2ludCwgSURlYnVnU2VydmljZSB9IGZyb20gXCIuLi90eXBlc1wiXG5cbmltcG9ydCB7IEF0b21JbnB1dCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9BdG9tSW5wdXRcIlxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcbmltcG9ydCB7IEJ1dHRvbiwgQnV0dG9uVHlwZXMgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvQnV0dG9uXCJcbmltcG9ydCB7IEJ1dHRvbkdyb3VwIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0J1dHRvbkdyb3VwXCJcbmltcG9ydCBudWNsaWRlVXJpIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9udWNsaWRlVXJpXCJcbmltcG9ydCBVbml2ZXJzYWxEaXNwb3NhYmxlIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9Vbml2ZXJzYWxEaXNwb3NhYmxlXCJcbmltcG9ydCB7IENoZWNrYm94IH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0NoZWNrYm94XCJcbmltcG9ydCB7IE1vZGFsIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL01vZGFsXCJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqcy1jb21wYXQvYnVuZGxlcy9yeGpzLWNvbXBhdC51bWQubWluLmpzXCJcbmltcG9ydCB7IHRyYWNrIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL2FuYWx5dGljc1wiXG5pbXBvcnQgeyBBbmFseXRpY3NFdmVudHMgfSBmcm9tIFwiLi4vY29uc3RhbnRzXCJcblxudHlwZSBQcm9wc1R5cGUgPSB7XG4gIG9uRGlzbWlzczogKCkgPT4gdm9pZCxcbiAgYnJlYWtwb2ludDogSUJyZWFrcG9pbnQsXG4gIHNlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG4gIGFsbG93TG9nTWVzc2FnZTogUHJvbWlzZTxib29sZWFuPixcbn1cblxudHlwZSBTdGF0ZVR5cGUgPSB7XG4gIGJwSWQ6IHN0cmluZyxcbiAgZW5hYmxlZENoZWNrZWQ6IGJvb2xlYW4sXG4gIGNvbmRpdGlvbjogc3RyaW5nLFxuICBsb2dNZXNzYWdlOiBzdHJpbmcsXG4gIGFsbG93TG9nTWVzc2FnZTogYm9vbGVhbixcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQnJlYWtwb2ludENvbmZpZ0NvbXBvbmVudCBleHRlbmRzIFJlYWN0LkNvbXBvbmVudDxQcm9wc1R5cGUsIFN0YXRlVHlwZT4ge1xuICBfY29uZGl0aW9uSW5wdXQ6IFJlYWN0Q29tcG9uZW50UmVmPEF0b21JbnB1dD5cbiAgcHJvcHM6IFByb3BzVHlwZVxuICBzdGF0ZTogU3RhdGVUeXBlXG4gIF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxuXG4gIGNvbnN0cnVjdG9yKHByb3BzOiBQcm9wc1R5cGUpIHtcbiAgICBzdXBlcihwcm9wcylcbiAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcbiAgICB0aGlzLl9jb25kaXRpb25JbnB1dCA9IFJlYWN0LmNyZWF0ZVJlZigpXG4gICAgdGhpcy5zdGF0ZSA9IHtcbiAgICAgIGJwSWQ6IHRoaXMucHJvcHMuYnJlYWtwb2ludC5nZXRJZCgpLFxuICAgICAgZW5hYmxlZENoZWNrZWQ6IHRoaXMucHJvcHMuYnJlYWtwb2ludC5lbmFibGVkLFxuICAgICAgY29uZGl0aW9uOiB0aGlzLnByb3BzLmJyZWFrcG9pbnQuY29uZGl0aW9uID8/IFwiXCIsXG4gICAgICBsb2dNZXNzYWdlOiB0aGlzLnByb3BzLmJyZWFrcG9pbnQubG9nTWVzc2FnZSA/PyBcIlwiLFxuICAgICAgYWxsb3dMb2dNZXNzYWdlOiBmYWxzZSxcbiAgICB9XG5cbiAgICBjb25zdCBtb2RlbCA9IHRoaXMucHJvcHMuc2VydmljZS5nZXRNb2RlbCgpXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgbW9kZWwub25EaWRDaGFuZ2VCcmVha3BvaW50cygoKSA9PiB7XG4gICAgICAgIGNvbnN0IGJyZWFrcG9pbnQgPSBtb2RlbC5nZXRCcmVha3BvaW50cygpLmZpbHRlcigoYnApID0+IGJwLmdldElkKCkgPT09IHRoaXMuc3RhdGUuYnBJZClcbiAgICAgICAgaWYgKGJyZWFrcG9pbnQgPT0gbnVsbCkge1xuICAgICAgICAgIC8vIEJyZWFrcG9pbnQgbm8gbG9uZ2VyIGV4aXN0cy5cbiAgICAgICAgICB0aGlzLnByb3BzLm9uRGlzbWlzcygpXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5mb3JjZVVwZGF0ZSgpXG4gICAgICB9KSxcbiAgICAgIE9ic2VydmFibGUuZnJvbVByb21pc2UodGhpcy5wcm9wcy5hbGxvd0xvZ01lc3NhZ2UpLnN1YnNjcmliZSgoYWxsb3dMb2dNZXNzYWdlKSA9PiB7XG4gICAgICAgIHRoaXMuc2V0U3RhdGUoeyBhbGxvd0xvZ01lc3NhZ2UgfSlcbiAgICAgIH0pXG4gICAgKVxuICB9XG5cbiAgY29tcG9uZW50RGlkTW91bnQoKTogdm9pZCB7XG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX0JSRUFLUE9JTlRfQ09ORklHX1VJX1NIT1csIHtcbiAgICAgIGZpbGVFeHRlbnNpb246IG51Y2xpZGVVcmkuZXh0bmFtZSh0aGlzLnByb3BzLmJyZWFrcG9pbnQudXJpKSxcbiAgICB9KVxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcbiAgICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwgXCJjb3JlOmNhbmNlbFwiLCB0aGlzLnByb3BzLm9uRGlzbWlzcyksXG4gICAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIFwiY29yZTpjb25maXJtXCIsIHRoaXMuX3VwZGF0ZUJyZWFrcG9pbnQuYmluZCh0aGlzKSksXG4gICAgICBPYnNlcnZhYmxlLnRpbWVyKDEwMCkuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgICAgaWYgKHRoaXMuX2NvbmRpdGlvbklucHV0LmN1cnJlbnQgIT0gbnVsbCkge1xuICAgICAgICAgIHRoaXMuX2NvbmRpdGlvbklucHV0LmN1cnJlbnQuZm9jdXMoKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIClcbiAgfVxuXG4gIGNvbXBvbmVudFdpbGxVbm1vdW50KCk6IHZvaWQge1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgYXN5bmMgX3VwZGF0ZUJyZWFrcG9pbnQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgeyBicmVha3BvaW50LCBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXG4gICAgY29uc3QgeyBlbmFibGVkQ2hlY2tlZCB9ID0gdGhpcy5zdGF0ZVxuICAgIHNlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoZW5hYmxlZENoZWNrZWQsIHRoaXMucHJvcHMuYnJlYWtwb2ludClcbiAgICBjb25zdCBjb25kaXRpb24gPSB0aGlzLnN0YXRlLmNvbmRpdGlvbi50cmltKClcbiAgICBjb25zdCBsb2dNZXNzYWdlID0gdGhpcy5zdGF0ZS5sb2dNZXNzYWdlLnRyaW0oKVxuICAgIGlmIChjb25kaXRpb24gPT09IChicmVha3BvaW50LmNvbmRpdGlvbiA/PyBcIlwiKSAmJiBjb25kaXRpb24gPT09IChicmVha3BvaW50LmxvZ01lc3NhZ2UgPz8gXCJcIikpIHtcbiAgICAgIHRoaXMucHJvcHMub25EaXNtaXNzKClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGF3YWl0IHNlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnJlYWtwb2ludC5nZXRJZCgpKVxuXG4gICAgY29uc3QgYnA6IElVSUJyZWFrcG9pbnQgPSB7XG4gICAgICBsaW5lOiBicmVha3BvaW50LmxpbmUsXG4gICAgICBjb2x1bW46IGJyZWFrcG9pbnQuY29sdW1uLFxuICAgICAgZW5hYmxlZDogYnJlYWtwb2ludC5lbmFibGVkLFxuICAgICAgaWQ6IGJyZWFrcG9pbnQuZ2V0SWQoKSxcbiAgICAgIHVyaTogYnJlYWtwb2ludC51cmksXG4gICAgfVxuICAgIGlmIChjb25kaXRpb24gIT09IFwiXCIpIHtcbiAgICAgIGJwLmNvbmRpdGlvbiA9IGNvbmRpdGlvblxuICAgIH1cbiAgICBpZiAobG9nTWVzc2FnZSAhPT0gXCJcIikge1xuICAgICAgYnAubG9nTWVzc2FnZSA9IGxvZ01lc3NhZ2VcbiAgICB9XG5cbiAgICBhd2FpdCBzZXJ2aWNlLmFkZFVJQnJlYWtwb2ludHMoW2JwXSlcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfQlJFQUtQT0lOVF9VUERBVEVfQ09ORElUSU9OLCB7XG4gICAgICBwYXRoOiBicmVha3BvaW50LnVyaSxcbiAgICAgIGxpbmU6IGJyZWFrcG9pbnQubGluZSxcbiAgICAgIGNvbmRpdGlvbixcbiAgICAgIGxvZ01lc3NhZ2UsXG4gICAgICBmaWxlRXh0ZW5zaW9uOiBudWNsaWRlVXJpLmV4dG5hbWUoYnJlYWtwb2ludC51cmkpLFxuICAgIH0pXG4gICAgdGhpcy5wcm9wcy5vbkRpc21pc3MoKVxuICB9XG5cbiAgX3JlbmRlckxvZ01lc3NhZ2UoKTogP1JlYWN0Lk5vZGUge1xuICAgIGlmICghdGhpcy5zdGF0ZS5hbGxvd0xvZ01lc3NhZ2UpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgIDw+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYmxvY2tcIj5cbiAgICAgICAgICA8QXRvbUlucHV0XG4gICAgICAgICAgICBwbGFjZWhvbGRlclRleHQ9XCJCcmVha3BvaW50IGxvZyBtZXNzYWdlLi4uXCJcbiAgICAgICAgICAgIHZhbHVlPXt0aGlzLnN0YXRlLmxvZ01lc3NhZ2V9XG4gICAgICAgICAgICBzaXplPVwic21cIlxuICAgICAgICAgICAgb25EaWRDaGFuZ2U9eyh2YWx1ZSkgPT4gdGhpcy5zZXRTdGF0ZSh7IGxvZ01lc3NhZ2U6IHZhbHVlIH0pfVxuICAgICAgICAgIC8+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8bGFiZWw+XG4gICAgICAgICAgVGhpcyBtZXNzYWdlIHdpbGwgYmUgbG9nZ2VkIHRvIHRoZSBOdWNsaWRlIGNvbnNvbGUgZWFjaCB0aW1lIHRoZSBjb3JyZXNwb25kaW5nIGxpbmUgaXMgaGl0LiBUaGUgbWVzc2FnZSBjYW4gYmVcbiAgICAgICAgICBpbnRlcnBvbGF0ZWQgd2l0aCBleHByZXNzaW9ucyBieSB1c2luZyBjdXJseSBicmFjZXMuIEV4YW1wbGU6IFwiQ291bnRlcjoge1wie2NvdW50ZXJ9XCJ9XCIuXG4gICAgICAgIDwvbGFiZWw+XG4gICAgICA8Lz5cbiAgICApXG4gIH1cblxuICByZW5kZXIoKTogUmVhY3QuTm9kZSB7XG4gICAgcmV0dXJuIChcbiAgICAgIDxNb2RhbCBvbkRpc21pc3M9e3RoaXMucHJvcHMub25EaXNtaXNzfT5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJwYWRkZWQgZGVidWdnZXItYnAtZGlhbG9nXCI+XG4gICAgICAgICAgPGgxIGNsYXNzTmFtZT1cImRlYnVnZ2VyLWJwLWNvbmZpZy1oZWFkZXJcIj5FZGl0IGJyZWFrcG9pbnQ8L2gxPlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYmxvY2tcIj5cbiAgICAgICAgICAgIDxsYWJlbD5cbiAgICAgICAgICAgICAgQnJlYWtwb2ludCBhdCB7bnVjbGlkZVVyaS5iYXNlbmFtZSh0aGlzLnByb3BzLmJyZWFrcG9pbnQudXJpKX06e3RoaXMucHJvcHMuYnJlYWtwb2ludC5saW5lfVxuICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJsb2NrXCI+XG4gICAgICAgICAgICA8Q2hlY2tib3hcbiAgICAgICAgICAgICAgb25DaGFuZ2U9eyhpc0NoZWNrZWQpID0+IHtcbiAgICAgICAgICAgICAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfQlJFQUtQT0lOVF9UT0dHTEVfRU5BQkxFRCwge1xuICAgICAgICAgICAgICAgICAgZW5hYmxlZDogaXNDaGVja2VkLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICAgICAgICAgICAgICBlbmFibGVkQ2hlY2tlZDogaXNDaGVja2VkLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgIGNoZWNrZWQ9e3RoaXMuc3RhdGUuZW5hYmxlZENoZWNrZWR9XG4gICAgICAgICAgICAgIGxhYmVsPVwiRW5hYmxlIGJyZWFrcG9pbnRcIlxuICAgICAgICAgICAgLz5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJsb2NrXCI+XG4gICAgICAgICAgICA8QXRvbUlucHV0XG4gICAgICAgICAgICAgIHBsYWNlaG9sZGVyVGV4dD1cIkJyZWFrcG9pbnQgaGl0IGNvbmRpdGlvbi4uLlwiXG4gICAgICAgICAgICAgIHZhbHVlPXt0aGlzLnN0YXRlLmNvbmRpdGlvbn1cbiAgICAgICAgICAgICAgc2l6ZT1cInNtXCJcbiAgICAgICAgICAgICAgcmVmPXt0aGlzLl9jb25kaXRpb25JbnB1dH1cbiAgICAgICAgICAgICAgYXV0b2ZvY3VzPXt0cnVlfVxuICAgICAgICAgICAgICBvbkRpZENoYW5nZT17KHZhbHVlKSA9PiB0aGlzLnNldFN0YXRlKHsgY29uZGl0aW9uOiB2YWx1ZSB9KX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPGxhYmVsPlxuICAgICAgICAgICAgVGhpcyBleHByZXNzaW9uIHdpbGwgYmUgZXZhbHVhdGVkIGVhY2ggdGltZSB0aGUgY29ycmVzcG9uZGluZyBsaW5lIGlzIGhpdCwgYnV0IHRoZSBkZWJ1Z2dlciB3aWxsIG9ubHkgYnJlYWtcbiAgICAgICAgICAgIGV4ZWN1dGlvbiBpZiB0aGUgZXhwcmVzc2lvbiBldmFsdWF0ZXMgdG8gdHJ1ZS5cbiAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgIHt0aGlzLl9yZW5kZXJMb2dNZXNzYWdlKCl9XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icC1jb25maWctYWN0aW9uc1wiPlxuICAgICAgICAgICAgPEJ1dHRvbkdyb3VwPlxuICAgICAgICAgICAgICA8QnV0dG9uIG9uQ2xpY2s9e3RoaXMucHJvcHMub25EaXNtaXNzfT5DYW5jZWw8L0J1dHRvbj5cbiAgICAgICAgICAgICAgPEJ1dHRvbiBidXR0b25UeXBlPXtCdXR0b25UeXBlcy5QUklNQVJZfSBvbkNsaWNrPXt0aGlzLl91cGRhdGVCcmVha3BvaW50LmJpbmQodGhpcyl9PlxuICAgICAgICAgICAgICAgIFVwZGF0ZVxuICAgICAgICAgICAgICA8L0J1dHRvbj5cbiAgICAgICAgICAgIDwvQnV0dG9uR3JvdXA+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9Nb2RhbD5cbiAgICApXG4gIH1cbn1cbiJdfQ==