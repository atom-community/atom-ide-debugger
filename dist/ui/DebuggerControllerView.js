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

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyQ29udHJvbGxlclZpZXcuanMiXSwibmFtZXMiOlsiRGVidWdnZXJDb250cm9sbGVyVmlldyIsIlJlYWN0IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJwcm9wcyIsIl9kaXNwb3NhYmxlcyIsIlVuaXZlcnNhbERpc3Bvc2FibGUiLCJjb21wb25lbnREaWRNb3VudCIsInNlcnZpY2UiLCJhZGQiLCJPYnNlcnZhYmxlIiwibWVyZ2UiLCJ2aWV3TW9kZWwiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJiaW5kIiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsInN1YnNjcmliZSIsIm1vZGUiLCJmb3JjZVVwZGF0ZSIsImNvbXBvbmVudFdpbGxVbm1vdW50IiwiZGlzcG9zZSIsInJlbmRlciIsImZvY3VzZWRQcm9jZXNzIiwiZGVidWdnZXJNb2RlIiwiRGVidWdnZXJNb2RlIiwiU1RBUlRJTkciXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFNZSxNQUFNQSxzQkFBTixTQUFxQ0MsS0FBSyxDQUFDQyxTQUEzQyxDQUE0RDtBQUd6RUMsRUFBQUEsV0FBVyxDQUFDQyxLQUFELEVBQWU7QUFDeEIsVUFBTUEsS0FBTjtBQUR3QixTQUYxQkMsWUFFMEI7QUFFeEIsU0FBS0EsWUFBTCxHQUFvQixJQUFJQyw0QkFBSixFQUFwQjtBQUNEOztBQUVEQyxFQUFBQSxpQkFBaUIsR0FBRztBQUNsQixVQUFNO0FBQUVDLE1BQUFBO0FBQUYsUUFBYyxLQUFLSixLQUF6Qjs7QUFDQSxTQUFLQyxZQUFMLENBQWtCSSxHQUFsQixDQUNFQyw2QkFBV0MsS0FBWCxDQUNFLDRDQUFnQ0gsT0FBTyxDQUFDSSxTQUFSLENBQWtCQyx3QkFBbEIsQ0FBMkNDLElBQTNDLENBQWdETixPQUFPLENBQUNJLFNBQXhELENBQWhDLENBREYsRUFFRSw0Q0FBZ0NKLE9BQU8sQ0FBQ08sc0JBQVIsQ0FBK0JELElBQS9CLENBQW9DTixPQUFwQyxDQUFoQyxDQUZGLEVBR0VRLFNBSEYsQ0FHYUMsSUFBRCxJQUFVLEtBQUtDLFdBQUwsRUFIdEIsQ0FERjtBQU1EOztBQUVEQyxFQUFBQSxvQkFBb0IsR0FBUztBQUMzQixTQUFLZCxZQUFMLENBQWtCZSxPQUFsQjtBQUNEOztBQUVEQyxFQUFBQSxNQUFNLEdBQWU7QUFBQTs7QUFDbkIsUUFBSSwrQkFBS2pCLEtBQUwsQ0FBV0ksT0FBWCxDQUFtQkksU0FBbkIsQ0FBNkJVLGNBQTdCLGdGQUE2Q0MsWUFBN0MsTUFBOERDLHdCQUFhQyxRQUEvRSxFQUF5RjtBQUN2RiwwQkFDRTtBQUFLLFFBQUEsU0FBUyxFQUFDO0FBQWYsc0JBQ0UsOENBQ0U7QUFBTSxRQUFBLFNBQVMsRUFBQztBQUFoQixnQ0FERixlQUVFLG9CQUFDLDhCQUFEO0FBQWdCLFFBQUEsU0FBUyxFQUFDLGNBQTFCO0FBQXlDLFFBQUEsSUFBSSxFQUFDO0FBQTlDLFFBRkYsQ0FERixDQURGO0FBUUQ7O0FBQ0QsV0FBTyxJQUFQO0FBQ0Q7O0FBbEN3RSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgSURlYnVnU2VydmljZSB9IGZyb20gXCIuLi90eXBlc1wiXHJcblxyXG5pbXBvcnQgeyBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL2V2ZW50XCJcclxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcclxuaW1wb3J0IHsgTG9hZGluZ1NwaW5uZXIgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvTG9hZGluZ1NwaW5uZXJcIlxyXG5pbXBvcnQgVW5pdmVyc2FsRGlzcG9zYWJsZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvVW5pdmVyc2FsRGlzcG9zYWJsZVwiXHJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqcy1jb21wYXQvYnVuZGxlcy9yeGpzLWNvbXBhdC51bWQubWluLmpzXCJcclxuaW1wb3J0IHsgRGVidWdnZXJNb2RlIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXHJcblxyXG50eXBlIFByb3BzID0ge1xyXG4gIHNlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERlYnVnZ2VyQ29udHJvbGxlclZpZXcgZXh0ZW5kcyBSZWFjdC5Db21wb25lbnQ8UHJvcHM+IHtcclxuICBfZGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcclxuXHJcbiAgY29uc3RydWN0b3IocHJvcHM6IFByb3BzKSB7XHJcbiAgICBzdXBlcihwcm9wcylcclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxyXG4gIH1cclxuXHJcbiAgY29tcG9uZW50RGlkTW91bnQoKSB7XHJcbiAgICBjb25zdCB7IHNlcnZpY2UgfSA9IHRoaXMucHJvcHNcclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcclxuICAgICAgT2JzZXJ2YWJsZS5tZXJnZShcclxuICAgICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHNlcnZpY2Uudmlld01vZGVsLm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cy5iaW5kKHNlcnZpY2Uudmlld01vZGVsKSksXHJcbiAgICAgICAgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihzZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvY2Vzc01vZGUuYmluZChzZXJ2aWNlKSlcclxuICAgICAgKS5zdWJzY3JpYmUoKG1vZGUpID0+IHRoaXMuZm9yY2VVcGRhdGUoKSlcclxuICAgIClcclxuICB9XHJcblxyXG4gIGNvbXBvbmVudFdpbGxVbm1vdW50KCk6IHZvaWQge1xyXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpXHJcbiAgfVxyXG5cclxuICByZW5kZXIoKTogUmVhY3QuTm9kZSB7XHJcbiAgICBpZiAodGhpcy5wcm9wcy5zZXJ2aWNlLnZpZXdNb2RlbC5mb2N1c2VkUHJvY2Vzcz8uZGVidWdnZXJNb2RlID09PSBEZWJ1Z2dlck1vZGUuU1RBUlRJTkcpIHtcclxuICAgICAgcmV0dXJuIChcclxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXN0YXJ0aW5nLW1lc3NhZ2VcIj5cclxuICAgICAgICAgIDxkaXY+XHJcbiAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImlubGluZS1ibG9ja1wiPlN0YXJ0aW5nIERlYnVnZ2VyLi4uPC9zcGFuPlxyXG4gICAgICAgICAgICA8TG9hZGluZ1NwaW5uZXIgY2xhc3NOYW1lPVwiaW5saW5lLWJsb2NrXCIgc2l6ZT1cIkVYVFJBX1NNQUxMXCIgLz5cclxuICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICApXHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbFxyXG4gIH1cclxufVxyXG4iXX0=