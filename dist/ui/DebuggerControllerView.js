"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _event = require("@atom-ide-community/nuclide-commons/event");

var React = _interopRequireWildcard(require("react"));

var _LoadingSpinner = require("@atom-ide-community/nuclide-commons-ui/LoadingSpinner");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

var _constants = require("../constants");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

class DebuggerControllerView extends React.Component {
  constructor(props) {
    super(props);
    this._disposables = void 0;
    this._disposables = new _UniversalDisposable.default();
  }

  componentDidMount() {
    const {
      service
    } = this.props;

    this._disposables.add(_rxjsCompatUmdMin.Observable.merge((0, _event.observableFromSubscribeFunction)(service.viewModel.onDidChangeDebuggerFocus.bind(service.viewModel)), (0, _event.observableFromSubscribeFunction)(service.onDidChangeProcessMode.bind(service))).subscribe(mode => this.forceUpdate()));
  }

  componentWillUnmount() {
    this._disposables.dispose();
  }

  render() {
    var _this$props$service$v;

    if (((_this$props$service$v = this.props.service.viewModel.focusedProcess) === null || _this$props$service$v === void 0 ? void 0 : _this$props$service$v.debuggerMode) === _constants.DebuggerMode.STARTING) {
      return /*#__PURE__*/React.createElement("div", {
        className: "debugger-starting-message"
      }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
        className: "inline-block"
      }, "Starting Debugger..."), /*#__PURE__*/React.createElement(_LoadingSpinner.LoadingSpinner, {
        className: "inline-block",
        size: "EXTRA_SMALL"
      })));
    }

    return null;
  }

}

exports.default = DebuggerControllerView;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyQ29udHJvbGxlclZpZXcuanMiXSwibmFtZXMiOlsiRGVidWdnZXJDb250cm9sbGVyVmlldyIsIlJlYWN0IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJwcm9wcyIsIl9kaXNwb3NhYmxlcyIsIlVuaXZlcnNhbERpc3Bvc2FibGUiLCJjb21wb25lbnREaWRNb3VudCIsInNlcnZpY2UiLCJhZGQiLCJPYnNlcnZhYmxlIiwibWVyZ2UiLCJ2aWV3TW9kZWwiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJiaW5kIiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsInN1YnNjcmliZSIsIm1vZGUiLCJmb3JjZVVwZGF0ZSIsImNvbXBvbmVudFdpbGxVbm1vdW50IiwiZGlzcG9zZSIsInJlbmRlciIsImZvY3VzZWRQcm9jZXNzIiwiZGVidWdnZXJNb2RlIiwiRGVidWdnZXJNb2RlIiwiU1RBUlRJTkciXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFNZSxNQUFNQSxzQkFBTixTQUFxQ0MsS0FBSyxDQUFDQyxTQUEzQyxDQUE0RDtBQUd6RUMsRUFBQUEsV0FBVyxDQUFDQyxLQUFELEVBQWU7QUFDeEIsVUFBTUEsS0FBTjtBQUR3QixTQUYxQkMsWUFFMEI7QUFFeEIsU0FBS0EsWUFBTCxHQUFvQixJQUFJQyw0QkFBSixFQUFwQjtBQUNEOztBQUVEQyxFQUFBQSxpQkFBaUIsR0FBRztBQUNsQixVQUFNO0FBQUVDLE1BQUFBO0FBQUYsUUFBYyxLQUFLSixLQUF6Qjs7QUFDQSxTQUFLQyxZQUFMLENBQWtCSSxHQUFsQixDQUNFQyw2QkFBV0MsS0FBWCxDQUNFLDRDQUFnQ0gsT0FBTyxDQUFDSSxTQUFSLENBQWtCQyx3QkFBbEIsQ0FBMkNDLElBQTNDLENBQWdETixPQUFPLENBQUNJLFNBQXhELENBQWhDLENBREYsRUFFRSw0Q0FBZ0NKLE9BQU8sQ0FBQ08sc0JBQVIsQ0FBK0JELElBQS9CLENBQW9DTixPQUFwQyxDQUFoQyxDQUZGLEVBR0VRLFNBSEYsQ0FHYUMsSUFBRCxJQUFVLEtBQUtDLFdBQUwsRUFIdEIsQ0FERjtBQU1EOztBQUVEQyxFQUFBQSxvQkFBb0IsR0FBUztBQUMzQixTQUFLZCxZQUFMLENBQWtCZSxPQUFsQjtBQUNEOztBQUVEQyxFQUFBQSxNQUFNLEdBQWU7QUFBQTs7QUFDbkIsUUFBSSwrQkFBS2pCLEtBQUwsQ0FBV0ksT0FBWCxDQUFtQkksU0FBbkIsQ0FBNkJVLGNBQTdCLGdGQUE2Q0MsWUFBN0MsTUFBOERDLHdCQUFhQyxRQUEvRSxFQUF5RjtBQUN2RiwwQkFDRTtBQUFLLFFBQUEsU0FBUyxFQUFDO0FBQWYsc0JBQ0UsOENBQ0U7QUFBTSxRQUFBLFNBQVMsRUFBQztBQUFoQixnQ0FERixlQUVFLG9CQUFDLDhCQUFEO0FBQWdCLFFBQUEsU0FBUyxFQUFDLGNBQTFCO0FBQXlDLFFBQUEsSUFBSSxFQUFDO0FBQTlDLFFBRkYsQ0FERixDQURGO0FBUUQ7O0FBQ0QsV0FBTyxJQUFQO0FBQ0Q7O0FBbEN3RSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgSURlYnVnU2VydmljZSB9IGZyb20gXCIuLi90eXBlc1wiXG5cbmltcG9ydCB7IG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXZlbnRcIlxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcbmltcG9ydCB7IExvYWRpbmdTcGlubmVyIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0xvYWRpbmdTcGlubmVyXCJcbmltcG9ydCBVbml2ZXJzYWxEaXNwb3NhYmxlIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9Vbml2ZXJzYWxEaXNwb3NhYmxlXCJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqcy1jb21wYXQvYnVuZGxlcy9yeGpzLWNvbXBhdC51bWQubWluLmpzXCJcbmltcG9ydCB7IERlYnVnZ2VyTW9kZSB9IGZyb20gXCIuLi9jb25zdGFudHNcIlxuXG50eXBlIFByb3BzID0ge1xuICBzZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEZWJ1Z2dlckNvbnRyb2xsZXJWaWV3IGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50PFByb3BzPiB7XG4gIF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxuXG4gIGNvbnN0cnVjdG9yKHByb3BzOiBQcm9wcykge1xuICAgIHN1cGVyKHByb3BzKVxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxuICB9XG5cbiAgY29tcG9uZW50RGlkTW91bnQoKSB7XG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgT2JzZXJ2YWJsZS5tZXJnZShcbiAgICAgICAgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihzZXJ2aWNlLnZpZXdNb2RlbC5vbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMuYmluZChzZXJ2aWNlLnZpZXdNb2RlbCkpLFxuICAgICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHNlcnZpY2Uub25EaWRDaGFuZ2VQcm9jZXNzTW9kZS5iaW5kKHNlcnZpY2UpKVxuICAgICAgKS5zdWJzY3JpYmUoKG1vZGUpID0+IHRoaXMuZm9yY2VVcGRhdGUoKSlcbiAgICApXG4gIH1cblxuICBjb21wb25lbnRXaWxsVW5tb3VudCgpOiB2b2lkIHtcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHJlbmRlcigpOiBSZWFjdC5Ob2RlIHtcbiAgICBpZiAodGhpcy5wcm9wcy5zZXJ2aWNlLnZpZXdNb2RlbC5mb2N1c2VkUHJvY2Vzcz8uZGVidWdnZXJNb2RlID09PSBEZWJ1Z2dlck1vZGUuU1RBUlRJTkcpIHtcbiAgICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItc3RhcnRpbmctbWVzc2FnZVwiPlxuICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJpbmxpbmUtYmxvY2tcIj5TdGFydGluZyBEZWJ1Z2dlci4uLjwvc3Bhbj5cbiAgICAgICAgICAgIDxMb2FkaW5nU3Bpbm5lciBjbGFzc05hbWU9XCJpbmxpbmUtYmxvY2tcIiBzaXplPVwiRVhUUkFfU01BTExcIiAvPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICAgIClcbiAgICB9XG4gICAgcmV0dXJuIG51bGxcbiAgfVxufVxuIl19