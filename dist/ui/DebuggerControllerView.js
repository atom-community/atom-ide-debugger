"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _event = require("@atom-ide-community/nuclide-commons/event");

var React = _interopRequireWildcard(require("react"));

var _LoadingSpinner = require("@atom-ide-community/nuclide-commons-ui/LoadingSpinner");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _rxjs = require("rxjs");

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

    this._disposables.add(_rxjs.Observable.merge((0, _event.observableFromSubscribeFunction)(service.viewModel.onDidChangeDebuggerFocus.bind(service.viewModel)), (0, _event.observableFromSubscribeFunction)(service.onDidChangeProcessMode.bind(service))).subscribe(mode => this.forceUpdate()));
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyQ29udHJvbGxlclZpZXcuanMiXSwibmFtZXMiOlsiRGVidWdnZXJDb250cm9sbGVyVmlldyIsIlJlYWN0IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJwcm9wcyIsIl9kaXNwb3NhYmxlcyIsIlVuaXZlcnNhbERpc3Bvc2FibGUiLCJjb21wb25lbnREaWRNb3VudCIsInNlcnZpY2UiLCJhZGQiLCJPYnNlcnZhYmxlIiwibWVyZ2UiLCJ2aWV3TW9kZWwiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJiaW5kIiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsInN1YnNjcmliZSIsIm1vZGUiLCJmb3JjZVVwZGF0ZSIsImNvbXBvbmVudFdpbGxVbm1vdW50IiwiZGlzcG9zZSIsInJlbmRlciIsImZvY3VzZWRQcm9jZXNzIiwiZGVidWdnZXJNb2RlIiwiRGVidWdnZXJNb2RlIiwiU1RBUlRJTkciXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFNZSxNQUFNQSxzQkFBTixTQUFxQ0MsS0FBSyxDQUFDQyxTQUEzQyxDQUE0RDtBQUd6RUMsRUFBQUEsV0FBVyxDQUFDQyxLQUFELEVBQWU7QUFDeEIsVUFBTUEsS0FBTjtBQUR3QixTQUYxQkMsWUFFMEI7QUFFeEIsU0FBS0EsWUFBTCxHQUFvQixJQUFJQyw0QkFBSixFQUFwQjtBQUNEOztBQUVEQyxFQUFBQSxpQkFBaUIsR0FBRztBQUNsQixVQUFNO0FBQUVDLE1BQUFBO0FBQUYsUUFBYyxLQUFLSixLQUF6Qjs7QUFDQSxTQUFLQyxZQUFMLENBQWtCSSxHQUFsQixDQUNFQyxpQkFBV0MsS0FBWCxDQUNFLDRDQUFnQ0gsT0FBTyxDQUFDSSxTQUFSLENBQWtCQyx3QkFBbEIsQ0FBMkNDLElBQTNDLENBQWdETixPQUFPLENBQUNJLFNBQXhELENBQWhDLENBREYsRUFFRSw0Q0FBZ0NKLE9BQU8sQ0FBQ08sc0JBQVIsQ0FBK0JELElBQS9CLENBQW9DTixPQUFwQyxDQUFoQyxDQUZGLEVBR0VRLFNBSEYsQ0FHYUMsSUFBRCxJQUFVLEtBQUtDLFdBQUwsRUFIdEIsQ0FERjtBQU1EOztBQUVEQyxFQUFBQSxvQkFBb0IsR0FBUztBQUMzQixTQUFLZCxZQUFMLENBQWtCZSxPQUFsQjtBQUNEOztBQUVEQyxFQUFBQSxNQUFNLEdBQWU7QUFBQTs7QUFDbkIsUUFBSSwrQkFBS2pCLEtBQUwsQ0FBV0ksT0FBWCxDQUFtQkksU0FBbkIsQ0FBNkJVLGNBQTdCLGdGQUE2Q0MsWUFBN0MsTUFBOERDLHdCQUFhQyxRQUEvRSxFQUF5RjtBQUN2RiwwQkFDRTtBQUFLLFFBQUEsU0FBUyxFQUFDO0FBQWYsc0JBQ0UsOENBQ0U7QUFBTSxRQUFBLFNBQVMsRUFBQztBQUFoQixnQ0FERixlQUVFLG9CQUFDLDhCQUFEO0FBQWdCLFFBQUEsU0FBUyxFQUFDLGNBQTFCO0FBQXlDLFFBQUEsSUFBSSxFQUFDO0FBQTlDLFFBRkYsQ0FERixDQURGO0FBUUQ7O0FBQ0QsV0FBTyxJQUFQO0FBQ0Q7O0FBbEN3RSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgSURlYnVnU2VydmljZSB9IGZyb20gXCIuLi90eXBlc1wiXG5cbmltcG9ydCB7IG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXZlbnRcIlxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcbmltcG9ydCB7IExvYWRpbmdTcGlubmVyIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0xvYWRpbmdTcGlubmVyXCJcbmltcG9ydCBVbml2ZXJzYWxEaXNwb3NhYmxlIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9Vbml2ZXJzYWxEaXNwb3NhYmxlXCJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqc1wiXG5pbXBvcnQgeyBEZWJ1Z2dlck1vZGUgfSBmcm9tIFwiLi4vY29uc3RhbnRzXCJcblxudHlwZSBQcm9wcyA9IHtcbiAgc2VydmljZTogSURlYnVnU2VydmljZSxcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRGVidWdnZXJDb250cm9sbGVyVmlldyBleHRlbmRzIFJlYWN0LkNvbXBvbmVudDxQcm9wcz4ge1xuICBfZGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcblxuICBjb25zdHJ1Y3Rvcihwcm9wczogUHJvcHMpIHtcbiAgICBzdXBlcihwcm9wcylcbiAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcbiAgfVxuXG4gIGNvbXBvbmVudERpZE1vdW50KCkge1xuICAgIGNvbnN0IHsgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcbiAgICAgIE9ic2VydmFibGUubWVyZ2UoXG4gICAgICAgIG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24oc2VydmljZS52aWV3TW9kZWwub25EaWRDaGFuZ2VEZWJ1Z2dlckZvY3VzLmJpbmQoc2VydmljZS52aWV3TW9kZWwpKSxcbiAgICAgICAgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihzZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvY2Vzc01vZGUuYmluZChzZXJ2aWNlKSlcbiAgICAgICkuc3Vic2NyaWJlKChtb2RlKSA9PiB0aGlzLmZvcmNlVXBkYXRlKCkpXG4gICAgKVxuICB9XG5cbiAgY29tcG9uZW50V2lsbFVubW91bnQoKTogdm9pZCB7XG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICByZW5kZXIoKTogUmVhY3QuTm9kZSB7XG4gICAgaWYgKHRoaXMucHJvcHMuc2VydmljZS52aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3M/LmRlYnVnZ2VyTW9kZSA9PT0gRGVidWdnZXJNb2RlLlNUQVJUSU5HKSB7XG4gICAgICByZXR1cm4gKFxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXN0YXJ0aW5nLW1lc3NhZ2VcIj5cbiAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiaW5saW5lLWJsb2NrXCI+U3RhcnRpbmcgRGVidWdnZXIuLi48L3NwYW4+XG4gICAgICAgICAgICA8TG9hZGluZ1NwaW5uZXIgY2xhc3NOYW1lPVwiaW5saW5lLWJsb2NrXCIgc2l6ZT1cIkVYVFJBX1NNQUxMXCIgLz5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICApXG4gICAgfVxuICAgIHJldHVybiBudWxsXG4gIH1cbn1cbiJdfQ==