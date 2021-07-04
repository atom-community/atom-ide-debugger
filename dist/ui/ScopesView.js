"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _event = require("@atom-ide-community/nuclide-commons/event");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var React = _interopRequireWildcard(require("react"));

var _classnames = _interopRequireDefault(require("classnames"));

var _ScopesComponent = _interopRequireDefault(require("./ScopesComponent"));

var _constants = require("../constants");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ScopesView extends React.PureComponent {
  constructor(props) {
    super(props);
    this._scopesComponentWrapped = void 0;
    this._disposables = void 0;
    this._disposables = new _UniversalDisposable.default();
    this.state = {
      mode: _constants.DebuggerMode.STOPPED
    };
  }

  componentDidMount() {
    const {
      service
    } = this.props;

    this._disposables.add((0, _event.observableFromSubscribeFunction)(service.onDidChangeProcessMode.bind(service)).subscribe(data => this.setState({
      mode: data.mode
    })), (0, _event.observableFromSubscribeFunction)(service.viewModel.onDidChangeDebuggerFocus.bind(service)).startWith(null).subscribe(() => {
      const focusedProcess = this.props.service.viewModel.focusedProcess;
      this.setState({
        mode: focusedProcess == null ? _constants.DebuggerMode.STOPPED : focusedProcess.debuggerMode
      });
    }));
  }

  componentWillUnmount() {
    this._disposables.dispose();
  }

  render() {
    const {
      service
    } = this.props;
    const {
      mode
    } = this.state;
    const disabledClass = mode !== _constants.DebuggerMode.RUNNING ? "" : " debugger-container-new-disabled";
    return /*#__PURE__*/React.createElement("div", {
      className: (0, _classnames.default)("debugger-container-new", disabledClass)
    }, /*#__PURE__*/React.createElement("div", {
      className: "debugger-pane-content"
    }, /*#__PURE__*/React.createElement(_ScopesComponent.default, {
      service: service
    })));
  }

}

exports.default = ScopesView;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlNjb3Blc1ZpZXcuanMiXSwibmFtZXMiOlsiU2NvcGVzVmlldyIsIlJlYWN0IiwiUHVyZUNvbXBvbmVudCIsImNvbnN0cnVjdG9yIiwicHJvcHMiLCJfc2NvcGVzQ29tcG9uZW50V3JhcHBlZCIsIl9kaXNwb3NhYmxlcyIsIlVuaXZlcnNhbERpc3Bvc2FibGUiLCJzdGF0ZSIsIm1vZGUiLCJEZWJ1Z2dlck1vZGUiLCJTVE9QUEVEIiwiY29tcG9uZW50RGlkTW91bnQiLCJzZXJ2aWNlIiwiYWRkIiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsImJpbmQiLCJzdWJzY3JpYmUiLCJkYXRhIiwic2V0U3RhdGUiLCJ2aWV3TW9kZWwiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJzdGFydFdpdGgiLCJmb2N1c2VkUHJvY2VzcyIsImRlYnVnZ2VyTW9kZSIsImNvbXBvbmVudFdpbGxVbm1vdW50IiwiZGlzcG9zZSIsInJlbmRlciIsImRpc2FibGVkQ2xhc3MiLCJSVU5OSU5HIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBU2UsTUFBTUEsVUFBTixTQUF5QkMsS0FBSyxDQUFDQyxhQUEvQixDQUEyRDtBQUl4RUMsRUFBQUEsV0FBVyxDQUFDQyxLQUFELEVBQWU7QUFDeEIsVUFBTUEsS0FBTjtBQUR3QixTQUgxQkMsdUJBRzBCO0FBQUEsU0FGMUJDLFlBRTBCO0FBRXhCLFNBQUtBLFlBQUwsR0FBb0IsSUFBSUMsNEJBQUosRUFBcEI7QUFDQSxTQUFLQyxLQUFMLEdBQWE7QUFDWEMsTUFBQUEsSUFBSSxFQUFFQyx3QkFBYUM7QUFEUixLQUFiO0FBR0Q7O0FBRURDLEVBQUFBLGlCQUFpQixHQUFTO0FBQ3hCLFVBQU07QUFBRUMsTUFBQUE7QUFBRixRQUFjLEtBQUtULEtBQXpCOztBQUNBLFNBQUtFLFlBQUwsQ0FBa0JRLEdBQWxCLENBQ0UsNENBQWdDRCxPQUFPLENBQUNFLHNCQUFSLENBQStCQyxJQUEvQixDQUFvQ0gsT0FBcEMsQ0FBaEMsRUFBOEVJLFNBQTlFLENBQXlGQyxJQUFELElBQ3RGLEtBQUtDLFFBQUwsQ0FBYztBQUFFVixNQUFBQSxJQUFJLEVBQUVTLElBQUksQ0FBQ1Q7QUFBYixLQUFkLENBREYsQ0FERixFQUlFLDRDQUFnQ0ksT0FBTyxDQUFDTyxTQUFSLENBQWtCQyx3QkFBbEIsQ0FBMkNMLElBQTNDLENBQWdESCxPQUFoRCxDQUFoQyxFQUNHUyxTQURILENBQ2EsSUFEYixFQUVHTCxTQUZILENBRWEsTUFBTTtBQUNmLFlBQU1NLGNBQWMsR0FBRyxLQUFLbkIsS0FBTCxDQUFXUyxPQUFYLENBQW1CTyxTQUFuQixDQUE2QkcsY0FBcEQ7QUFDQSxXQUFLSixRQUFMLENBQWM7QUFDWlYsUUFBQUEsSUFBSSxFQUFFYyxjQUFjLElBQUksSUFBbEIsR0FBeUJiLHdCQUFhQyxPQUF0QyxHQUFnRFksY0FBYyxDQUFDQztBQUR6RCxPQUFkO0FBR0QsS0FQSCxDQUpGO0FBYUQ7O0FBRURDLEVBQUFBLG9CQUFvQixHQUFTO0FBQzNCLFNBQUtuQixZQUFMLENBQWtCb0IsT0FBbEI7QUFDRDs7QUFFREMsRUFBQUEsTUFBTSxHQUFlO0FBQ25CLFVBQU07QUFBRWQsTUFBQUE7QUFBRixRQUFjLEtBQUtULEtBQXpCO0FBQ0EsVUFBTTtBQUFFSyxNQUFBQTtBQUFGLFFBQVcsS0FBS0QsS0FBdEI7QUFDQSxVQUFNb0IsYUFBYSxHQUFHbkIsSUFBSSxLQUFLQyx3QkFBYW1CLE9BQXRCLEdBQWdDLEVBQWhDLEdBQXFDLGtDQUEzRDtBQUVBLHdCQUNFO0FBQUssTUFBQSxTQUFTLEVBQUUseUJBQVcsd0JBQVgsRUFBcUNELGFBQXJDO0FBQWhCLG9CQUNFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRSxvQkFBQyx3QkFBRDtBQUFpQixNQUFBLE9BQU8sRUFBRWY7QUFBMUIsTUFERixDQURGLENBREY7QUFPRDs7QUE3Q3VFIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBEZWJ1Z2dlck1vZGVUeXBlLCBJRGVidWdTZXJ2aWNlIH0gZnJvbSBcIi4uL3R5cGVzXCJcblxuaW1wb3J0IHsgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9ldmVudFwiXG5pbXBvcnQgVW5pdmVyc2FsRGlzcG9zYWJsZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvVW5pdmVyc2FsRGlzcG9zYWJsZVwiXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxuaW1wb3J0IGNsYXNzbmFtZXMgZnJvbSBcImNsYXNzbmFtZXNcIlxuaW1wb3J0IFNjb3Blc0NvbXBvbmVudCBmcm9tIFwiLi9TY29wZXNDb21wb25lbnRcIlxuaW1wb3J0IHsgRGVidWdnZXJNb2RlIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5cbnR5cGUgUHJvcHMgPSB7XG4gIHNlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG59XG50eXBlIFN0YXRlID0ge1xuICBtb2RlOiBEZWJ1Z2dlck1vZGVUeXBlLFxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTY29wZXNWaWV3IGV4dGVuZHMgUmVhY3QuUHVyZUNvbXBvbmVudDxQcm9wcywgU3RhdGU+IHtcbiAgX3Njb3Blc0NvbXBvbmVudFdyYXBwZWQ6IFJlYWN0LkNvbXBvbmVudFR5cGU8YW55PlxuICBfZGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcblxuICBjb25zdHJ1Y3Rvcihwcm9wczogUHJvcHMpIHtcbiAgICBzdXBlcihwcm9wcylcbiAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcbiAgICB0aGlzLnN0YXRlID0ge1xuICAgICAgbW9kZTogRGVidWdnZXJNb2RlLlNUT1BQRUQsXG4gICAgfVxuICB9XG5cbiAgY29tcG9uZW50RGlkTW91bnQoKTogdm9pZCB7XG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihzZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvY2Vzc01vZGUuYmluZChzZXJ2aWNlKSkuc3Vic2NyaWJlKChkYXRhKSA9PlxuICAgICAgICB0aGlzLnNldFN0YXRlKHsgbW9kZTogZGF0YS5tb2RlIH0pXG4gICAgICApLFxuICAgICAgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihzZXJ2aWNlLnZpZXdNb2RlbC5vbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMuYmluZChzZXJ2aWNlKSlcbiAgICAgICAgLnN0YXJ0V2l0aChudWxsKVxuICAgICAgICAuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgICAgICBjb25zdCBmb2N1c2VkUHJvY2VzcyA9IHRoaXMucHJvcHMuc2VydmljZS52aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3NcbiAgICAgICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgICAgIG1vZGU6IGZvY3VzZWRQcm9jZXNzID09IG51bGwgPyBEZWJ1Z2dlck1vZGUuU1RPUFBFRCA6IGZvY3VzZWRQcm9jZXNzLmRlYnVnZ2VyTW9kZSxcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgIClcbiAgfVxuXG4gIGNvbXBvbmVudFdpbGxVbm1vdW50KCk6IHZvaWQge1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xuICAgIGNvbnN0IHsgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xuICAgIGNvbnN0IHsgbW9kZSB9ID0gdGhpcy5zdGF0ZVxuICAgIGNvbnN0IGRpc2FibGVkQ2xhc3MgPSBtb2RlICE9PSBEZWJ1Z2dlck1vZGUuUlVOTklORyA/IFwiXCIgOiBcIiBkZWJ1Z2dlci1jb250YWluZXItbmV3LWRpc2FibGVkXCJcblxuICAgIHJldHVybiAoXG4gICAgICA8ZGl2IGNsYXNzTmFtZT17Y2xhc3NuYW1lcyhcImRlYnVnZ2VyLWNvbnRhaW5lci1uZXdcIiwgZGlzYWJsZWRDbGFzcyl9PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXBhbmUtY29udGVudFwiPlxuICAgICAgICAgIDxTY29wZXNDb21wb25lbnQgc2VydmljZT17c2VydmljZX0gLz5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICApXG4gIH1cbn1cbiJdfQ==