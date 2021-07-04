"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var React = _interopRequireWildcard(require("react"));

var _classnames = _interopRequireDefault(require("classnames"));

var _AtomInput = require("@atom-ide-community/nuclide-commons-ui/AtomInput");

var _bindObservableAsProps = require("@atom-ide-community/nuclide-commons-ui/bindObservableAsProps");

var _nullthrows = _interopRequireDefault(require("nullthrows"));

var _assert = _interopRequireDefault(require("assert"));

var _Icon = require("@atom-ide-community/nuclide-commons-ui/Icon");

var _utils = require("../utils");

var _ExpressionTreeComponent = require("./ExpressionTreeComponent");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

class WatchExpressionComponent extends React.Component {
  constructor(_props) {
    super(_props);
    this.coreCancelDisposable = void 0;
    this._newExpressionEditor = void 0;
    this._editExpressionEditor = void 0;
    this._expansionStates = void 0;

    this._onConfirmNewExpression = () => {
      const text = (0, _nullthrows.default)(this._newExpressionEditor).getText();
      this.addExpression(text);
      (0, _nullthrows.default)(this._newExpressionEditor).setText("");
    };

    this._resetExpressionEditState = () => {
      if (this.coreCancelDisposable) {
        this.coreCancelDisposable.dispose();
        this.coreCancelDisposable = null;
      }

      this.setState({
        rowBeingEdited: null
      });
    };

    this._renderExpression = watchExpression => {
      const {
        focusedProcess,
        focusedStackFrame
      } = this.props;
      const id = watchExpression.getId();
      const containerContext = this;

      if (id === this.state.rowBeingEdited) {
        return /*#__PURE__*/React.createElement(_AtomInput.AtomInput, {
          className: "debugger-watch-expression-input",
          autofocus: true,
          startSelected: true,
          key: id,
          onConfirm: this._onConfirmExpressionEdit.bind(this, id),
          onCancel: this._resetExpressionEditState,
          onBlur: this._resetExpressionEditState,
          ref: input => {
            this._editExpressionEditor = input;
          },
          size: "sm",
          initialValue: watchExpression.name
        });
      }

      const ExpressionComponent = focusedProcess == null ? null : (0, _bindObservableAsProps.bindObservableAsProps)((0, _utils.evaluateExpressionAsStream)(watchExpression, focusedProcess, focusedStackFrame, "watch").map(result => {
        (0, _assert.default)(result != null);
        const props = {
          containerContext,
          pending: result.isPending,
          readOnly: true,
          expression: result.isPending || result.isError ? watchExpression : result.value
        };
        return props;
      }), _ExpressionTreeComponent.ExpressionTreeComponent);
      return /*#__PURE__*/React.createElement("div", {
        className: (0, _classnames.default)("debugger-expression-value-row", "debugger-watch-expression-row"),
        key: id
      }, /*#__PURE__*/React.createElement("div", {
        className: (0, _classnames.default)("debugger-expression-value-content", "debugger-watch-expression-value-content"),
        onDoubleClick: this._setRowBeingEdited.bind(this, id)
      }, ExpressionComponent == null ? /*#__PURE__*/React.createElement("span", null, watchExpression.name, ": Not available ", /*#__PURE__*/React.createElement("i", null, "(the debugger is not running)"), ".") : /*#__PURE__*/React.createElement(ExpressionComponent, null)), /*#__PURE__*/React.createElement("div", {
        className: "debugger-watch-expression-controls"
      }, /*#__PURE__*/React.createElement(_Icon.Icon, {
        icon: "pencil",
        className: "debugger-watch-expression-control",
        onClick: this._setRowBeingEdited.bind(this, id)
      }), /*#__PURE__*/React.createElement(_Icon.Icon, {
        icon: "x",
        className: "debugger-watch-expression-control",
        onClick: this.removeExpression.bind(this, id)
      })));
    };

    this._expansionStates = new Map();
    this.state = {
      rowBeingEdited: null
    };
  }

  removeExpression(id, event) {
    event.stopPropagation();
    this.props.onRemoveWatchExpression(id);
  }

  addExpression(expression) {
    this.props.onAddWatchExpression(expression);
  }

  _onConfirmExpressionEdit(id) {
    const text = (0, _nullthrows.default)(this._editExpressionEditor).getText();
    this.props.onUpdateWatchExpression(id, text);

    this._resetExpressionEditState();
  }

  _setRowBeingEdited(id) {
    this.setState({
      rowBeingEdited: id
    });

    if (this.coreCancelDisposable) {
      this.coreCancelDisposable.dispose();
    }

    this.coreCancelDisposable = atom.commands.add("atom-workspace", {
      "core:cancel": () => this._resetExpressionEditState()
    });
  }

  render() {
    const expressions = this.props.watchExpressions.map(this._renderExpression);
    const addNewExpressionInput = /*#__PURE__*/React.createElement(_AtomInput.AtomInput, {
      className: (0, _classnames.default)("debugger-watch-expression-input", "debugger-watch-expression-add-new-input"),
      onConfirm: this._onConfirmNewExpression,
      ref: input => {
        this._newExpressionEditor = input;
      },
      size: "sm",
      placeholderText: "Add new watch expression"
    });
    return /*#__PURE__*/React.createElement("div", {
      className: "debugger-expression-value-list"
    }, expressions, addNewExpressionInput);
  }

}

exports.default = WatchExpressionComponent;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIldhdGNoRXhwcmVzc2lvbkNvbXBvbmVudC5qcyJdLCJuYW1lcyI6WyJXYXRjaEV4cHJlc3Npb25Db21wb25lbnQiLCJSZWFjdCIsIkNvbXBvbmVudCIsImNvbnN0cnVjdG9yIiwicHJvcHMiLCJjb3JlQ2FuY2VsRGlzcG9zYWJsZSIsIl9uZXdFeHByZXNzaW9uRWRpdG9yIiwiX2VkaXRFeHByZXNzaW9uRWRpdG9yIiwiX2V4cGFuc2lvblN0YXRlcyIsIl9vbkNvbmZpcm1OZXdFeHByZXNzaW9uIiwidGV4dCIsImdldFRleHQiLCJhZGRFeHByZXNzaW9uIiwic2V0VGV4dCIsIl9yZXNldEV4cHJlc3Npb25FZGl0U3RhdGUiLCJkaXNwb3NlIiwic2V0U3RhdGUiLCJyb3dCZWluZ0VkaXRlZCIsIl9yZW5kZXJFeHByZXNzaW9uIiwid2F0Y2hFeHByZXNzaW9uIiwiZm9jdXNlZFByb2Nlc3MiLCJmb2N1c2VkU3RhY2tGcmFtZSIsImlkIiwiZ2V0SWQiLCJjb250YWluZXJDb250ZXh0Iiwic3RhdGUiLCJfb25Db25maXJtRXhwcmVzc2lvbkVkaXQiLCJiaW5kIiwiaW5wdXQiLCJuYW1lIiwiRXhwcmVzc2lvbkNvbXBvbmVudCIsIm1hcCIsInJlc3VsdCIsInBlbmRpbmciLCJpc1BlbmRpbmciLCJyZWFkT25seSIsImV4cHJlc3Npb24iLCJpc0Vycm9yIiwidmFsdWUiLCJFeHByZXNzaW9uVHJlZUNvbXBvbmVudCIsIl9zZXRSb3dCZWluZ0VkaXRlZCIsInJlbW92ZUV4cHJlc3Npb24iLCJNYXAiLCJldmVudCIsInN0b3BQcm9wYWdhdGlvbiIsIm9uUmVtb3ZlV2F0Y2hFeHByZXNzaW9uIiwib25BZGRXYXRjaEV4cHJlc3Npb24iLCJvblVwZGF0ZVdhdGNoRXhwcmVzc2lvbiIsImF0b20iLCJjb21tYW5kcyIsImFkZCIsInJlbmRlciIsImV4cHJlc3Npb25zIiwid2F0Y2hFeHByZXNzaW9ucyIsImFkZE5ld0V4cHJlc3Npb25JbnB1dCJdLCJtYXBwaW5ncyI6Ijs7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SWlGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBJRXZhbHVhdGFibGVFeHByZXNzaW9uLCBJU3RhY2tGcmFtZSwgSVByb2Nlc3MgfSBmcm9tIFwiLi4vdHlwZXNcIlxuaW1wb3J0IHR5cGUgeyBFeHByZXNzaW9uVHJlZUNvbXBvbmVudFByb3BzIH0gZnJvbSBcIi4vRXhwcmVzc2lvblRyZWVDb21wb25lbnRcIlxuXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxuaW1wb3J0IGNsYXNzbmFtZXMgZnJvbSBcImNsYXNzbmFtZXNcIlxuaW1wb3J0IHsgQXRvbUlucHV0IH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0F0b21JbnB1dFwiXG5pbXBvcnQgeyBiaW5kT2JzZXJ2YWJsZUFzUHJvcHMgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvYmluZE9ic2VydmFibGVBc1Byb3BzXCJcbmltcG9ydCBudWxsdGhyb3dzIGZyb20gXCJudWxsdGhyb3dzXCJcbmltcG9ydCBpbnZhcmlhbnQgZnJvbSBcImFzc2VydFwiXG5pbXBvcnQgeyBJY29uIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0ljb25cIlxuaW1wb3J0IHsgZXZhbHVhdGVFeHByZXNzaW9uQXNTdHJlYW0gfSBmcm9tIFwiLi4vdXRpbHNcIlxuaW1wb3J0IHsgRXhwcmVzc2lvblRyZWVDb21wb25lbnQgfSBmcm9tIFwiLi9FeHByZXNzaW9uVHJlZUNvbXBvbmVudFwiXG5cbnR5cGUgUHJvcHMgPSB7XG4gIHdhdGNoRXhwcmVzc2lvbnM6IEFycmF5PElFdmFsdWF0YWJsZUV4cHJlc3Npb24+LFxuICBmb2N1c2VkU3RhY2tGcmFtZTogP0lTdGFja0ZyYW1lLFxuICBmb2N1c2VkUHJvY2VzczogP0lQcm9jZXNzLFxuICBvbkFkZFdhdGNoRXhwcmVzc2lvbjogKGV4cHJlc3Npb246IHN0cmluZykgPT4gdm9pZCxcbiAgb25SZW1vdmVXYXRjaEV4cHJlc3Npb246IChpZDogc3RyaW5nKSA9PiB2b2lkLFxuICBvblVwZGF0ZVdhdGNoRXhwcmVzc2lvbjogKGlkOiBzdHJpbmcsIG5ld0V4cHJlc3Npb246IHN0cmluZykgPT4gdm9pZCxcbn1cblxudHlwZSBTdGF0ZSA9IHtcbiAgcm93QmVpbmdFZGl0ZWQ6ID9zdHJpbmcsXG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFdhdGNoRXhwcmVzc2lvbkNvbXBvbmVudCBleHRlbmRzIFJlYWN0LkNvbXBvbmVudDxQcm9wcywgU3RhdGU+IHtcbiAgY29yZUNhbmNlbERpc3Bvc2FibGU6ID9JRGlzcG9zYWJsZVxuICBfbmV3RXhwcmVzc2lvbkVkaXRvcjogP0F0b21JbnB1dFxuICBfZWRpdEV4cHJlc3Npb25FZGl0b3I6ID9BdG9tSW5wdXRcbiAgX2V4cGFuc2lvblN0YXRlczogTWFwPHN0cmluZyAvKiBleHByZXNzaW9uICovLCAvKiB1bmlxdWUgcmVmZXJlbmNlIGZvciBleHByZXNzaW9uICovIE9iamVjdD5cblxuICBjb25zdHJ1Y3Rvcihwcm9wczogUHJvcHMpIHtcbiAgICBzdXBlcihwcm9wcylcbiAgICB0aGlzLl9leHBhbnNpb25TdGF0ZXMgPSBuZXcgTWFwKClcbiAgICB0aGlzLnN0YXRlID0ge1xuICAgICAgcm93QmVpbmdFZGl0ZWQ6IG51bGwsXG4gICAgfVxuICB9XG5cbiAgcmVtb3ZlRXhwcmVzc2lvbihpZDogc3RyaW5nLCBldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXG4gICAgdGhpcy5wcm9wcy5vblJlbW92ZVdhdGNoRXhwcmVzc2lvbihpZClcbiAgfVxuXG4gIGFkZEV4cHJlc3Npb24oZXhwcmVzc2lvbjogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy5wcm9wcy5vbkFkZFdhdGNoRXhwcmVzc2lvbihleHByZXNzaW9uKVxuICB9XG5cbiAgX29uQ29uZmlybU5ld0V4cHJlc3Npb24gPSAoKTogdm9pZCA9PiB7XG4gICAgY29uc3QgdGV4dCA9IG51bGx0aHJvd3ModGhpcy5fbmV3RXhwcmVzc2lvbkVkaXRvcikuZ2V0VGV4dCgpXG4gICAgdGhpcy5hZGRFeHByZXNzaW9uKHRleHQpXG4gICAgbnVsbHRocm93cyh0aGlzLl9uZXdFeHByZXNzaW9uRWRpdG9yKS5zZXRUZXh0KFwiXCIpXG4gIH1cblxuICBfb25Db25maXJtRXhwcmVzc2lvbkVkaXQoaWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHRleHQgPSBudWxsdGhyb3dzKHRoaXMuX2VkaXRFeHByZXNzaW9uRWRpdG9yKS5nZXRUZXh0KClcbiAgICB0aGlzLnByb3BzLm9uVXBkYXRlV2F0Y2hFeHByZXNzaW9uKGlkLCB0ZXh0KVxuICAgIHRoaXMuX3Jlc2V0RXhwcmVzc2lvbkVkaXRTdGF0ZSgpXG4gIH1cblxuICBfc2V0Um93QmVpbmdFZGl0ZWQoaWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgcm93QmVpbmdFZGl0ZWQ6IGlkLFxuICAgIH0pXG4gICAgaWYgKHRoaXMuY29yZUNhbmNlbERpc3Bvc2FibGUpIHtcbiAgICAgIHRoaXMuY29yZUNhbmNlbERpc3Bvc2FibGUuZGlzcG9zZSgpXG4gICAgfVxuICAgIHRoaXMuY29yZUNhbmNlbERpc3Bvc2FibGUgPSBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcbiAgICAgIFwiY29yZTpjYW5jZWxcIjogKCkgPT4gdGhpcy5fcmVzZXRFeHByZXNzaW9uRWRpdFN0YXRlKCksXG4gICAgfSlcbiAgfVxuXG4gIF9yZXNldEV4cHJlc3Npb25FZGl0U3RhdGUgPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKHRoaXMuY29yZUNhbmNlbERpc3Bvc2FibGUpIHtcbiAgICAgIHRoaXMuY29yZUNhbmNlbERpc3Bvc2FibGUuZGlzcG9zZSgpXG4gICAgICB0aGlzLmNvcmVDYW5jZWxEaXNwb3NhYmxlID0gbnVsbFxuICAgIH1cbiAgICB0aGlzLnNldFN0YXRlKHsgcm93QmVpbmdFZGl0ZWQ6IG51bGwgfSlcbiAgfVxuXG4gIF9yZW5kZXJFeHByZXNzaW9uID0gKHdhdGNoRXhwcmVzc2lvbjogSUV2YWx1YXRhYmxlRXhwcmVzc2lvbik6IFJlYWN0LkVsZW1lbnQ8YW55PiA9PiB7XG4gICAgY29uc3QgeyBmb2N1c2VkUHJvY2VzcywgZm9jdXNlZFN0YWNrRnJhbWUgfSA9IHRoaXMucHJvcHNcbiAgICBjb25zdCBpZCA9IHdhdGNoRXhwcmVzc2lvbi5nZXRJZCgpXG4gICAgY29uc3QgY29udGFpbmVyQ29udGV4dCA9IHRoaXNcbiAgICBpZiAoaWQgPT09IHRoaXMuc3RhdGUucm93QmVpbmdFZGl0ZWQpIHtcbiAgICAgIHJldHVybiAoXG4gICAgICAgIDxBdG9tSW5wdXRcbiAgICAgICAgICBjbGFzc05hbWU9XCJkZWJ1Z2dlci13YXRjaC1leHByZXNzaW9uLWlucHV0XCJcbiAgICAgICAgICBhdXRvZm9jdXM9e3RydWV9XG4gICAgICAgICAgc3RhcnRTZWxlY3RlZD17dHJ1ZX1cbiAgICAgICAgICBrZXk9e2lkfVxuICAgICAgICAgIG9uQ29uZmlybT17dGhpcy5fb25Db25maXJtRXhwcmVzc2lvbkVkaXQuYmluZCh0aGlzLCBpZCl9XG4gICAgICAgICAgb25DYW5jZWw9e3RoaXMuX3Jlc2V0RXhwcmVzc2lvbkVkaXRTdGF0ZX1cbiAgICAgICAgICBvbkJsdXI9e3RoaXMuX3Jlc2V0RXhwcmVzc2lvbkVkaXRTdGF0ZX1cbiAgICAgICAgICByZWY9eyhpbnB1dCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5fZWRpdEV4cHJlc3Npb25FZGl0b3IgPSBpbnB1dFxuICAgICAgICAgIH19XG4gICAgICAgICAgc2l6ZT1cInNtXCJcbiAgICAgICAgICBpbml0aWFsVmFsdWU9e3dhdGNoRXhwcmVzc2lvbi5uYW1lfVxuICAgICAgICAvPlxuICAgICAgKVxuICAgIH1cblxuICAgIGNvbnN0IEV4cHJlc3Npb25Db21wb25lbnQgPVxuICAgICAgZm9jdXNlZFByb2Nlc3MgPT0gbnVsbFxuICAgICAgICA/IG51bGxcbiAgICAgICAgOiBiaW5kT2JzZXJ2YWJsZUFzUHJvcHMoXG4gICAgICAgICAgICBldmFsdWF0ZUV4cHJlc3Npb25Bc1N0cmVhbSh3YXRjaEV4cHJlc3Npb24sIGZvY3VzZWRQcm9jZXNzLCBmb2N1c2VkU3RhY2tGcmFtZSwgXCJ3YXRjaFwiKS5tYXAoKHJlc3VsdCkgPT4ge1xuICAgICAgICAgICAgICBpbnZhcmlhbnQocmVzdWx0ICE9IG51bGwpXG4gICAgICAgICAgICAgIGNvbnN0IHByb3BzOiBFeHByZXNzaW9uVHJlZUNvbXBvbmVudFByb3BzID0ge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lckNvbnRleHQsXG4gICAgICAgICAgICAgICAgcGVuZGluZzogcmVzdWx0LmlzUGVuZGluZyxcbiAgICAgICAgICAgICAgICByZWFkT25seTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBleHByZXNzaW9uOiByZXN1bHQuaXNQZW5kaW5nIHx8IHJlc3VsdC5pc0Vycm9yID8gd2F0Y2hFeHByZXNzaW9uIDogcmVzdWx0LnZhbHVlLFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBwcm9wc1xuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBFeHByZXNzaW9uVHJlZUNvbXBvbmVudFxuICAgICAgICAgIClcblxuICAgIHJldHVybiAoXG4gICAgICA8ZGl2IGNsYXNzTmFtZT17Y2xhc3NuYW1lcyhcImRlYnVnZ2VyLWV4cHJlc3Npb24tdmFsdWUtcm93XCIsIFwiZGVidWdnZXItd2F0Y2gtZXhwcmVzc2lvbi1yb3dcIil9IGtleT17aWR9PlxuICAgICAgICA8ZGl2XG4gICAgICAgICAgY2xhc3NOYW1lPXtjbGFzc25hbWVzKFwiZGVidWdnZXItZXhwcmVzc2lvbi12YWx1ZS1jb250ZW50XCIsIFwiZGVidWdnZXItd2F0Y2gtZXhwcmVzc2lvbi12YWx1ZS1jb250ZW50XCIpfVxuICAgICAgICAgIG9uRG91YmxlQ2xpY2s9e3RoaXMuX3NldFJvd0JlaW5nRWRpdGVkLmJpbmQodGhpcywgaWQpfVxuICAgICAgICA+XG4gICAgICAgICAge0V4cHJlc3Npb25Db21wb25lbnQgPT0gbnVsbCA/IChcbiAgICAgICAgICAgIDxzcGFuPlxuICAgICAgICAgICAgICB7d2F0Y2hFeHByZXNzaW9uLm5hbWV9OiBOb3QgYXZhaWxhYmxlIDxpPih0aGUgZGVidWdnZXIgaXMgbm90IHJ1bm5pbmcpPC9pPi5cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICApIDogKFxuICAgICAgICAgICAgPEV4cHJlc3Npb25Db21wb25lbnQgLz5cbiAgICAgICAgICApfVxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci13YXRjaC1leHByZXNzaW9uLWNvbnRyb2xzXCI+XG4gICAgICAgICAgPEljb25cbiAgICAgICAgICAgIGljb249XCJwZW5jaWxcIlxuICAgICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItd2F0Y2gtZXhwcmVzc2lvbi1jb250cm9sXCJcbiAgICAgICAgICAgIG9uQ2xpY2s9e3RoaXMuX3NldFJvd0JlaW5nRWRpdGVkLmJpbmQodGhpcywgaWQpfVxuICAgICAgICAgIC8+XG4gICAgICAgICAgPEljb24gaWNvbj1cInhcIiBjbGFzc05hbWU9XCJkZWJ1Z2dlci13YXRjaC1leHByZXNzaW9uLWNvbnRyb2xcIiBvbkNsaWNrPXt0aGlzLnJlbW92ZUV4cHJlc3Npb24uYmluZCh0aGlzLCBpZCl9IC8+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgKVxuICB9XG5cbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xuICAgIGNvbnN0IGV4cHJlc3Npb25zID0gdGhpcy5wcm9wcy53YXRjaEV4cHJlc3Npb25zLm1hcCh0aGlzLl9yZW5kZXJFeHByZXNzaW9uKVxuICAgIGNvbnN0IGFkZE5ld0V4cHJlc3Npb25JbnB1dCA9IChcbiAgICAgIDxBdG9tSW5wdXRcbiAgICAgICAgY2xhc3NOYW1lPXtjbGFzc25hbWVzKFwiZGVidWdnZXItd2F0Y2gtZXhwcmVzc2lvbi1pbnB1dFwiLCBcImRlYnVnZ2VyLXdhdGNoLWV4cHJlc3Npb24tYWRkLW5ldy1pbnB1dFwiKX1cbiAgICAgICAgb25Db25maXJtPXt0aGlzLl9vbkNvbmZpcm1OZXdFeHByZXNzaW9ufVxuICAgICAgICByZWY9eyhpbnB1dCkgPT4ge1xuICAgICAgICAgIHRoaXMuX25ld0V4cHJlc3Npb25FZGl0b3IgPSBpbnB1dFxuICAgICAgICB9fVxuICAgICAgICBzaXplPVwic21cIlxuICAgICAgICBwbGFjZWhvbGRlclRleHQ9XCJBZGQgbmV3IHdhdGNoIGV4cHJlc3Npb25cIlxuICAgICAgLz5cbiAgICApXG4gICAgcmV0dXJuIChcbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItZXhwcmVzc2lvbi12YWx1ZS1saXN0XCI+XG4gICAgICAgIHtleHByZXNzaW9uc31cbiAgICAgICAge2FkZE5ld0V4cHJlc3Npb25JbnB1dH1cbiAgICAgIDwvZGl2PlxuICAgIClcbiAgfVxufVxuIl19