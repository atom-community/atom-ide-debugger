"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _classnames = _interopRequireDefault(require("classnames"));

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var React = _interopRequireWildcard(require("react"));

var _bindObservableAsProps = require("@atom-ide-community/nuclide-commons-ui/bindObservableAsProps");

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

var _WatchExpressionComponent = _interopRequireDefault(require("./WatchExpressionComponent"));

var _event = require("@atom-ide-community/nuclide-commons/event");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class WatchView extends React.PureComponent {
  constructor(props) {
    super(props);
    this._watchExpressionComponentWrapped = void 0;
    this._disposables = void 0;
    const {
      service
    } = props;
    const {
      viewModel
    } = service;
    const model = service.getModel();
    const watchExpressionChanges = (0, _event.observableFromSubscribeFunction)(model.onDidChangeWatchExpressions.bind(model));
    const focusChanges = (0, _event.observableFromSubscribeFunction)(viewModel.onDidChangeDebuggerFocus.bind(viewModel));
    const expressionContextChanges = (0, _event.observableFromSubscribeFunction)(viewModel.onDidChangeExpressionContext.bind(viewModel));
    this._watchExpressionComponentWrapped = (0, _bindObservableAsProps.bindObservableAsProps)(_rxjsCompatUmdMin.Observable.merge(watchExpressionChanges, focusChanges, expressionContextChanges).startWith(null).map(() => ({
      focusedProcess: viewModel.focusedProcess,
      focusedStackFrame: viewModel.focusedStackFrame,
      watchExpressions: model.getWatchExpressions()
    })), _WatchExpressionComponent.default);
  }

  render() {
    const {
      service
    } = this.props;
    const WatchExpressionComponentWrapped = this._watchExpressionComponentWrapped;
    return /*#__PURE__*/React.createElement("div", {
      className: (0, _classnames.default)("debugger-container-new")
    }, /*#__PURE__*/React.createElement("div", {
      className: "debugger-pane-content"
    }, /*#__PURE__*/React.createElement(WatchExpressionComponentWrapped, {
      onAddWatchExpression: service.addWatchExpression.bind(service),
      onRemoveWatchExpression: service.removeWatchExpressions.bind(service),
      onUpdateWatchExpression: service.renameWatchExpression.bind(service)
    })));
  }

}

exports.default = WatchView;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIldhdGNoVmlldy5qcyJdLCJuYW1lcyI6WyJXYXRjaFZpZXciLCJSZWFjdCIsIlB1cmVDb21wb25lbnQiLCJjb25zdHJ1Y3RvciIsInByb3BzIiwiX3dhdGNoRXhwcmVzc2lvbkNvbXBvbmVudFdyYXBwZWQiLCJfZGlzcG9zYWJsZXMiLCJzZXJ2aWNlIiwidmlld01vZGVsIiwibW9kZWwiLCJnZXRNb2RlbCIsIndhdGNoRXhwcmVzc2lvbkNoYW5nZXMiLCJvbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvbnMiLCJiaW5kIiwiZm9jdXNDaGFuZ2VzIiwib25EaWRDaGFuZ2VEZWJ1Z2dlckZvY3VzIiwiZXhwcmVzc2lvbkNvbnRleHRDaGFuZ2VzIiwib25EaWRDaGFuZ2VFeHByZXNzaW9uQ29udGV4dCIsIk9ic2VydmFibGUiLCJtZXJnZSIsInN0YXJ0V2l0aCIsIm1hcCIsImZvY3VzZWRQcm9jZXNzIiwiZm9jdXNlZFN0YWNrRnJhbWUiLCJ3YXRjaEV4cHJlc3Npb25zIiwiZ2V0V2F0Y2hFeHByZXNzaW9ucyIsIldhdGNoRXhwcmVzc2lvbkNvbXBvbmVudCIsInJlbmRlciIsIldhdGNoRXhwcmVzc2lvbkNvbXBvbmVudFdyYXBwZWQiLCJhZGRXYXRjaEV4cHJlc3Npb24iLCJyZW1vdmVXYXRjaEV4cHJlc3Npb25zIiwicmVuYW1lV2F0Y2hFeHByZXNzaW9uIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBTWUsTUFBTUEsU0FBTixTQUF3QkMsS0FBSyxDQUFDQyxhQUE5QixDQUFtRDtBQUloRUMsRUFBQUEsV0FBVyxDQUFDQyxLQUFELEVBQWU7QUFDeEIsVUFBTUEsS0FBTjtBQUR3QixTQUgxQkMsZ0NBRzBCO0FBQUEsU0FGMUJDLFlBRTBCO0FBRXhCLFVBQU07QUFBRUMsTUFBQUE7QUFBRixRQUFjSCxLQUFwQjtBQUNBLFVBQU07QUFBRUksTUFBQUE7QUFBRixRQUFnQkQsT0FBdEI7QUFDQSxVQUFNRSxLQUFLLEdBQUdGLE9BQU8sQ0FBQ0csUUFBUixFQUFkO0FBQ0EsVUFBTUMsc0JBQXNCLEdBQUcsNENBQWdDRixLQUFLLENBQUNHLDJCQUFOLENBQWtDQyxJQUFsQyxDQUF1Q0osS0FBdkMsQ0FBaEMsQ0FBL0I7QUFDQSxVQUFNSyxZQUFZLEdBQUcsNENBQWdDTixTQUFTLENBQUNPLHdCQUFWLENBQW1DRixJQUFuQyxDQUF3Q0wsU0FBeEMsQ0FBaEMsQ0FBckI7QUFDQSxVQUFNUSx3QkFBd0IsR0FBRyw0Q0FDL0JSLFNBQVMsQ0FBQ1MsNEJBQVYsQ0FBdUNKLElBQXZDLENBQTRDTCxTQUE1QyxDQUQrQixDQUFqQztBQUdBLFNBQUtILGdDQUFMLEdBQXdDLGtEQUN0Q2EsNkJBQVdDLEtBQVgsQ0FBaUJSLHNCQUFqQixFQUF5Q0csWUFBekMsRUFBdURFLHdCQUF2RCxFQUNHSSxTQURILENBQ2EsSUFEYixFQUVHQyxHQUZILENBRU8sT0FBTztBQUNWQyxNQUFBQSxjQUFjLEVBQUVkLFNBQVMsQ0FBQ2MsY0FEaEI7QUFFVkMsTUFBQUEsaUJBQWlCLEVBQUVmLFNBQVMsQ0FBQ2UsaUJBRm5CO0FBR1ZDLE1BQUFBLGdCQUFnQixFQUFFZixLQUFLLENBQUNnQixtQkFBTjtBQUhSLEtBQVAsQ0FGUCxDQURzQyxFQVF0Q0MsaUNBUnNDLENBQXhDO0FBVUQ7O0FBRURDLEVBQUFBLE1BQU0sR0FBZTtBQUNuQixVQUFNO0FBQUVwQixNQUFBQTtBQUFGLFFBQWMsS0FBS0gsS0FBekI7QUFDQSxVQUFNd0IsK0JBQStCLEdBQUcsS0FBS3ZCLGdDQUE3QztBQUVBLHdCQUNFO0FBQUssTUFBQSxTQUFTLEVBQUUseUJBQVcsd0JBQVg7QUFBaEIsb0JBQ0U7QUFBSyxNQUFBLFNBQVMsRUFBQztBQUFmLG9CQUNFLG9CQUFDLCtCQUFEO0FBQ0UsTUFBQSxvQkFBb0IsRUFBRUUsT0FBTyxDQUFDc0Isa0JBQVIsQ0FBMkJoQixJQUEzQixDQUFnQ04sT0FBaEMsQ0FEeEI7QUFFRSxNQUFBLHVCQUF1QixFQUFFQSxPQUFPLENBQUN1QixzQkFBUixDQUErQmpCLElBQS9CLENBQW9DTixPQUFwQyxDQUYzQjtBQUdFLE1BQUEsdUJBQXVCLEVBQUVBLE9BQU8sQ0FBQ3dCLHFCQUFSLENBQThCbEIsSUFBOUIsQ0FBbUNOLE9BQW5DO0FBSDNCLE1BREYsQ0FERixDQURGO0FBV0Q7O0FBekMrRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgSURlYnVnU2VydmljZSB9IGZyb20gXCIuLi90eXBlc1wiXG5cbmltcG9ydCBjbGFzc25hbWVzIGZyb20gXCJjbGFzc25hbWVzXCJcbmltcG9ydCBVbml2ZXJzYWxEaXNwb3NhYmxlIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9Vbml2ZXJzYWxEaXNwb3NhYmxlXCJcbmltcG9ydCAqIGFzIFJlYWN0IGZyb20gXCJyZWFjdFwiXG5pbXBvcnQgeyBiaW5kT2JzZXJ2YWJsZUFzUHJvcHMgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvYmluZE9ic2VydmFibGVBc1Byb3BzXCJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqcy1jb21wYXQvYnVuZGxlcy9yeGpzLWNvbXBhdC51bWQubWluLmpzXCJcbmltcG9ydCBXYXRjaEV4cHJlc3Npb25Db21wb25lbnQgZnJvbSBcIi4vV2F0Y2hFeHByZXNzaW9uQ29tcG9uZW50XCJcbmltcG9ydCB7IG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXZlbnRcIlxuXG50eXBlIFByb3BzID0ge1xuICBzZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBXYXRjaFZpZXcgZXh0ZW5kcyBSZWFjdC5QdXJlQ29tcG9uZW50PFByb3BzPiB7XG4gIF93YXRjaEV4cHJlc3Npb25Db21wb25lbnRXcmFwcGVkOiBSZWFjdC5Db21wb25lbnRUeXBlPGFueT5cbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXG5cbiAgY29uc3RydWN0b3IocHJvcHM6IFByb3BzKSB7XG4gICAgc3VwZXIocHJvcHMpXG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSBwcm9wc1xuICAgIGNvbnN0IHsgdmlld01vZGVsIH0gPSBzZXJ2aWNlXG4gICAgY29uc3QgbW9kZWwgPSBzZXJ2aWNlLmdldE1vZGVsKClcbiAgICBjb25zdCB3YXRjaEV4cHJlc3Npb25DaGFuZ2VzID0gb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihtb2RlbC5vbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvbnMuYmluZChtb2RlbCkpXG4gICAgY29uc3QgZm9jdXNDaGFuZ2VzID0gb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbih2aWV3TW9kZWwub25EaWRDaGFuZ2VEZWJ1Z2dlckZvY3VzLmJpbmQodmlld01vZGVsKSlcbiAgICBjb25zdCBleHByZXNzaW9uQ29udGV4dENoYW5nZXMgPSBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKFxuICAgICAgdmlld01vZGVsLm9uRGlkQ2hhbmdlRXhwcmVzc2lvbkNvbnRleHQuYmluZCh2aWV3TW9kZWwpXG4gICAgKVxuICAgIHRoaXMuX3dhdGNoRXhwcmVzc2lvbkNvbXBvbmVudFdyYXBwZWQgPSBiaW5kT2JzZXJ2YWJsZUFzUHJvcHMoXG4gICAgICBPYnNlcnZhYmxlLm1lcmdlKHdhdGNoRXhwcmVzc2lvbkNoYW5nZXMsIGZvY3VzQ2hhbmdlcywgZXhwcmVzc2lvbkNvbnRleHRDaGFuZ2VzKVxuICAgICAgICAuc3RhcnRXaXRoKG51bGwpXG4gICAgICAgIC5tYXAoKCkgPT4gKHtcbiAgICAgICAgICBmb2N1c2VkUHJvY2Vzczogdmlld01vZGVsLmZvY3VzZWRQcm9jZXNzLFxuICAgICAgICAgIGZvY3VzZWRTdGFja0ZyYW1lOiB2aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWUsXG4gICAgICAgICAgd2F0Y2hFeHByZXNzaW9uczogbW9kZWwuZ2V0V2F0Y2hFeHByZXNzaW9ucygpLFxuICAgICAgICB9KSksXG4gICAgICBXYXRjaEV4cHJlc3Npb25Db21wb25lbnRcbiAgICApXG4gIH1cblxuICByZW5kZXIoKTogUmVhY3QuTm9kZSB7XG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXG4gICAgY29uc3QgV2F0Y2hFeHByZXNzaW9uQ29tcG9uZW50V3JhcHBlZCA9IHRoaXMuX3dhdGNoRXhwcmVzc2lvbkNvbXBvbmVudFdyYXBwZWRcblxuICAgIHJldHVybiAoXG4gICAgICA8ZGl2IGNsYXNzTmFtZT17Y2xhc3NuYW1lcyhcImRlYnVnZ2VyLWNvbnRhaW5lci1uZXdcIil9PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXBhbmUtY29udGVudFwiPlxuICAgICAgICAgIDxXYXRjaEV4cHJlc3Npb25Db21wb25lbnRXcmFwcGVkXG4gICAgICAgICAgICBvbkFkZFdhdGNoRXhwcmVzc2lvbj17c2VydmljZS5hZGRXYXRjaEV4cHJlc3Npb24uYmluZChzZXJ2aWNlKX1cbiAgICAgICAgICAgIG9uUmVtb3ZlV2F0Y2hFeHByZXNzaW9uPXtzZXJ2aWNlLnJlbW92ZVdhdGNoRXhwcmVzc2lvbnMuYmluZChzZXJ2aWNlKX1cbiAgICAgICAgICAgIG9uVXBkYXRlV2F0Y2hFeHByZXNzaW9uPXtzZXJ2aWNlLnJlbmFtZVdhdGNoRXhwcmVzc2lvbi5iaW5kKHNlcnZpY2UpfVxuICAgICAgICAgIC8+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgKVxuICB9XG59XG4iXX0=