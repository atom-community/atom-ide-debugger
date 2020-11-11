"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ExpressionTreeComponent = exports.ExpressionTreeNode = void 0;

var _AtomInput = require("@atom-ide-community/nuclide-commons-ui/AtomInput");

var _Icon = require("@atom-ide-community/nuclide-commons-ui/Icon");

var _analytics = require("@atom-ide-community/nuclide-commons/analytics");

var React = _interopRequireWildcard(require("react"));

var _classnames = _interopRequireDefault(require("classnames"));

var _expected = require("@atom-ide-community/nuclide-commons/expected");

var _ignoreTextSelectionEvents = _interopRequireDefault(require("@atom-ide-community/nuclide-commons-ui/ignoreTextSelectionEvents"));

var _assert = _interopRequireDefault(require("assert"));

var _nullthrows = _interopRequireDefault(require("nullthrows"));

var _LoadingSpinner = require("@atom-ide-community/nuclide-commons-ui/LoadingSpinner");

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

var _SimpleValueComponent = _interopRequireWildcard(require("@atom-ide-community/nuclide-commons-ui/SimpleValueComponent"));

var _Tree = require("@atom-ide-community/nuclide-commons-ui/Tree");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _ValueComponentClassNames = require("@atom-ide-community/nuclide-commons-ui/ValueComponentClassNames");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const EDIT_VALUE_FROM_ICON = "edit-value-from-icon";
const NOT_AVAILABLE_MESSAGE = "<not available>";
const SPINNER_DELAY = 200;
/* ms */
// This weak map tracks which node path(s) are expanded in a recursive expression
// value tree. These must be tracked outside of the React objects themselves, because
// expansion state is persisted even if the tree is destroyed and recreated (such as when
// stepping in a debugger). The root of each tree has a context, which is based on the
// component that contains the tree (such as a debugger pane, tooltip or console pane).
// When that component is destroyed, the WeakMap will remove the expansion state information
// for the entire tree.

const ExpansionStates = new WeakMap();

class ExpressionTreeNode extends React.Component {
  constructor(props) {
    super(props);
    this.state = void 0;
    this._toggleNodeExpanded = void 0;
    this._disposables = void 0;
    this._subscription = void 0;

    this._isExpandable = () => {
      if (this.props.pending) {
        return false;
      }

      return this.props.expression.hasChildren();
    };

    this._isExpanded = () => {
      if (!this._isExpandable()) {
        return false;
      }

      const {
        expansionCache,
        nodePath
      } = this.props;
      return Boolean(expansionCache.get(nodePath));
    };

    this._setExpanded = expanded => {
      const {
        expansionCache,
        nodePath
      } = this.props;
      expansionCache.set(nodePath, expanded);

      if (expanded) {
        this._fetchChildren();
      } else {
        this._stopFetchingChildren();
      }

      this.setState({
        expanded
      });
    };

    this._stopFetchingChildren = () => {
      if (this._subscription != null) {
        this._subscription.unsubscribe();

        this._subscription = null;
      }
    };

    this._fetchChildren = () => {
      this._stopFetchingChildren();

      if (this._isExpandable()) {
        this._subscription = _rxjsCompatUmdMin.Observable.fromPromise(this.props.expression.getChildren()).catch(error => _rxjsCompatUmdMin.Observable.of([])).map(children => _expected.Expect.value(children)).startWith(_expected.Expect.pending()).subscribe(children => {
          this.setState({
            children
          });
        });
      }
    };

    this._toggleExpand = event => {
      this._setExpanded(!this.state.expanded);

      event.stopPropagation();
    };

    this._renderValueLine = (expression, value) => {
      if (expression == null) {
        return /*#__PURE__*/React.createElement("div", {
          className: "nuclide-ui-expression-tree-value-container native-key-bindings"
        }, value);
      } else {
        return this.props.hideExpressionName ? /*#__PURE__*/React.createElement("div", {
          className: "nuclide-ui-lazy-nested-value-container native-key-bindings"
        }, value) : /*#__PURE__*/React.createElement("div", {
          className: "nuclide-ui-lazy-nested-value-container native-key-bindings"
        }, /*#__PURE__*/React.createElement("span", {
          className: _ValueComponentClassNames.ValueComponentClassNames.identifier
        }, expression), ": ", value);
      }
    };

    this._renderChild = child => {
      const nodePath = this.props.nodePath + "/" + child.name;
      return /*#__PURE__*/React.createElement(_Tree.TreeItem, {
        key: nodePath
      }, /*#__PURE__*/React.createElement(ExpressionTreeNode, {
        expression: child,
        expansionCache: this.props.expansionCache,
        nodePath: nodePath
      }));
    };

    this._isEditable = () => {
      const variable = this._getVariableExpression();

      return variable != null && variable.canSetVariable() && !this.props.readOnly;
    };

    this._updateValue = () => {
      const {
        pendingValue
      } = this.state;
      const variable = (0, _nullthrows.default)(this._getVariableExpression());
      const doEdit = pendingValue != null;

      this._cancelEdit(doEdit);

      if (doEdit) {
        (0, _assert.default)(pendingValue != null);

        const subscription = _rxjsCompatUmdMin.Observable.fromPromise(variable.setVariable(pendingValue)).catch(error => {
          if (error != null && error.message != null) {
            atom.notifications.addError(`Failed to set variable value: ${String(error.message)}`);
          }

          return _rxjsCompatUmdMin.Observable.of(null);
        }).subscribe(() => {
          this._disposables.remove(subscription);

          this.setState({
            pendingSave: false
          });
        });

        this._disposables.add(subscription);
      }
    };

    this._cancelEdit = (pendingSave = false) => {
      const newState = {
        isEditing: false,
        pendingValue: null
      };

      if (pendingSave != null) {
        newState.pendingSave = pendingSave;
      }

      this.setState(newState);
    };

    this._startEdit = () => {
      this.setState({
        isEditing: true,
        pendingValue: null,
        pendingSave: false
      });
    };

    this._getValueAsString = expression => {
      const value = expression.getValue();

      if (value != null && expression.type === "string") {
        return _SimpleValueComponent.STRING_REGEX.test(value) ? value : `"${value}"`;
      }

      return value || "";
    };

    this._setEditorGrammar = editor => {
      if (editor == null) {
        return;
      }

      const variable = this._getVariableExpression();

      if (variable == null) {
        return;
      }

      if (variable.grammarName != null && variable.grammarName !== "") {
        const grammar = atom.grammars.grammarForScopeName(variable.grammarName);

        if (grammar == null) {
          return;
        }

        editor.getTextEditor().setGrammar(grammar);
      }
    };

    this._renderEditView = expression => {
      return /*#__PURE__*/React.createElement("div", {
        className: "expression-tree-line-control"
      }, /*#__PURE__*/React.createElement(_AtomInput.AtomInput, {
        className: "expression-tree-value-box inline-block",
        size: "sm",
        autofocus: true,
        startSelected: false,
        initialValue: this._getValueAsString(expression),
        onDidChange: pendingValue => {
          this.setState({
            pendingValue: pendingValue.trim()
          });
        },
        onConfirm: this._updateValue,
        onCancel: () => this._cancelEdit(),
        onBlur: () => this._cancelEdit(),
        ref: this._setEditorGrammar
      }), /*#__PURE__*/React.createElement(_Icon.Icon, {
        icon: "check",
        title: "Save changes",
        className: "expression-tree-edit-button-confirm",
        onClick: this._updateValue
      }), /*#__PURE__*/React.createElement(_Icon.Icon, {
        icon: "x",
        title: "Cancel changes",
        className: "expression-tree-edit-button-cancel",
        onClick: this._cancelEdit
      }));
    };

    this._subscription = null;
    this._disposables = new _UniversalDisposable.default();

    this._disposables.add(() => {
      if (this._subscription != null) {
        this._subscription.unsubscribe();
      }
    });

    this._toggleNodeExpanded = (0, _ignoreTextSelectionEvents.default)(this._toggleExpand.bind(this));
    this.state = {
      expanded: this._isExpanded(),
      children: _expected.Expect.pending(),
      isEditing: false,
      pendingValue: null,
      pendingSave: false
    };
  }

  componentDidMount() {
    if (this.state.expanded) {
      this._fetchChildren();
    }
  }

  componentWillUnmount() {
    this._disposables.dispose();
  }

  _getVariableExpression() {
    const {
      expression
    } = this.props;
    return expression.canSetVariable == null || expression.setVariable == null ? null : expression;
  }

  _renderEditHoverControls() {
    if (!this._isEditable() || this.state.isEditing) {
      return null;
    }

    return /*#__PURE__*/React.createElement("div", {
      className: "debugger-scopes-view-controls"
    }, /*#__PURE__*/React.createElement(_Icon.Icon, {
      icon: "pencil",
      className: "debugger-scopes-view-edit-control",
      onClick: _ => {
        (0, _analytics.track)(EDIT_VALUE_FROM_ICON);

        this._startEdit();
      }
    }));
  }

  render() {
    const {
      pending,
      expression
    } = this.props;
    const {
      pendingSave
    } = this.state;

    if (pending || pendingSave) {
      // Value not available yet. Show a delayed loading spinner.
      return /*#__PURE__*/React.createElement(_Tree.TreeItem, {
        className: "nuclide-ui-expression-tree-value-spinner"
      }, /*#__PURE__*/React.createElement(_LoadingSpinner.LoadingSpinner, {
        size: "EXTRA_SMALL",
        delay: SPINNER_DELAY
      }));
    }

    const isEditable = this._isEditable();

    if (!this._isExpandable()) {
      // This is a simple value with no children.
      return /*#__PURE__*/React.createElement("div", {
        onDoubleClick: isEditable && !this.state.isEditing ? this._startEdit : () => {},
        className: "expression-tree-line-control"
      }, this.state.isEditing ? this._renderEditView(expression) : /*#__PURE__*/React.createElement("span", {
        className: "native-key-bindings expression-tree-value-box"
      }, /*#__PURE__*/React.createElement(_SimpleValueComponent.default, {
        expression: expression
      })), isEditable ? this._renderEditHoverControls() : null);
    } // A node with a delayed spinner to display if we're expanded, but waiting for
    // children to be fetched.


    const pendingChildrenNode = /*#__PURE__*/React.createElement(ExpressionTreeNode, {
      expression: this.props.expression,
      pending: true,
      expansionCache: this.props.expansionCache,
      nodePath: this.props.nodePath
    }); // If collapsed, render no children. Otherwise either render the pendingChildrenNode
    // if the fetch hasn't completed, or the children if we've got them.

    let children;

    if (!this.state.expanded) {
      children = null;
    } else if (this.state.children.isPending) {
      children = pendingChildrenNode;
    } else if (this.state.children.isError) {
      children = this._renderValueLine("Children", this.state.children.error != null ? this.state.children.error.toString() : NOT_AVAILABLE_MESSAGE);
    } else {
      children = this.state.children.value.map(child => this._renderChild(child));
    }

    return /*#__PURE__*/React.createElement(_Tree.TreeList, {
      showArrows: true,
      className: "nuclide-ui-expression-tree-value-treelist"
    }, /*#__PURE__*/React.createElement(_Tree.NestedTreeItem, {
      collapsed: !this.state.expanded,
      onConfirm: isEditable ? this._startEdit : () => {},
      onSelect: this.state.isEditing ? () => {} : this._toggleNodeExpanded,
      title: this.state.isEditing ? this._renderEditView(expression) : this._renderValueLine(expression.name, expression.getValue())
    }, children));
  }

}

exports.ExpressionTreeNode = ExpressionTreeNode;

class ExpressionTreeComponent extends React.Component {
  constructor(props) {
    super(props);

    this._getExpansionCache = () => {
      let cache = ExpansionStates.get(this.props.containerContext);

      if (cache == null) {
        cache = new Map();
        ExpansionStates.set(this.props.containerContext, cache);
      }

      return cache;
    };
  }

  render() {
    const className = (0, _classnames.default)(this.props.className, {
      "nuclide-ui-expression-tree-value": this.props.className == null
    });
    return /*#__PURE__*/React.createElement("span", {
      className: className,
      tabIndex: -1
    }, /*#__PURE__*/React.createElement(ExpressionTreeNode, {
      expression: this.props.expression,
      pending: this.props.pending,
      nodePath: "root",
      expansionCache: this._getExpansionCache(),
      hideExpressionName: this.props.hideExpressionName,
      readOnly: this.props.readOnly
    }));
  }

}

exports.ExpressionTreeComponent = ExpressionTreeComponent;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkV4cHJlc3Npb25UcmVlQ29tcG9uZW50LmpzIl0sIm5hbWVzIjpbIkVESVRfVkFMVUVfRlJPTV9JQ09OIiwiTk9UX0FWQUlMQUJMRV9NRVNTQUdFIiwiU1BJTk5FUl9ERUxBWSIsIkV4cGFuc2lvblN0YXRlcyIsIldlYWtNYXAiLCJFeHByZXNzaW9uVHJlZU5vZGUiLCJSZWFjdCIsIkNvbXBvbmVudCIsImNvbnN0cnVjdG9yIiwicHJvcHMiLCJzdGF0ZSIsIl90b2dnbGVOb2RlRXhwYW5kZWQiLCJfZGlzcG9zYWJsZXMiLCJfc3Vic2NyaXB0aW9uIiwiX2lzRXhwYW5kYWJsZSIsInBlbmRpbmciLCJleHByZXNzaW9uIiwiaGFzQ2hpbGRyZW4iLCJfaXNFeHBhbmRlZCIsImV4cGFuc2lvbkNhY2hlIiwibm9kZVBhdGgiLCJCb29sZWFuIiwiZ2V0IiwiX3NldEV4cGFuZGVkIiwiZXhwYW5kZWQiLCJzZXQiLCJfZmV0Y2hDaGlsZHJlbiIsIl9zdG9wRmV0Y2hpbmdDaGlsZHJlbiIsInNldFN0YXRlIiwidW5zdWJzY3JpYmUiLCJPYnNlcnZhYmxlIiwiZnJvbVByb21pc2UiLCJnZXRDaGlsZHJlbiIsImNhdGNoIiwiZXJyb3IiLCJvZiIsIm1hcCIsImNoaWxkcmVuIiwiRXhwZWN0IiwidmFsdWUiLCJzdGFydFdpdGgiLCJzdWJzY3JpYmUiLCJfdG9nZ2xlRXhwYW5kIiwiZXZlbnQiLCJzdG9wUHJvcGFnYXRpb24iLCJfcmVuZGVyVmFsdWVMaW5lIiwiaGlkZUV4cHJlc3Npb25OYW1lIiwiVmFsdWVDb21wb25lbnRDbGFzc05hbWVzIiwiaWRlbnRpZmllciIsIl9yZW5kZXJDaGlsZCIsImNoaWxkIiwibmFtZSIsIl9pc0VkaXRhYmxlIiwidmFyaWFibGUiLCJfZ2V0VmFyaWFibGVFeHByZXNzaW9uIiwiY2FuU2V0VmFyaWFibGUiLCJyZWFkT25seSIsIl91cGRhdGVWYWx1ZSIsInBlbmRpbmdWYWx1ZSIsImRvRWRpdCIsIl9jYW5jZWxFZGl0Iiwic3Vic2NyaXB0aW9uIiwic2V0VmFyaWFibGUiLCJtZXNzYWdlIiwiYXRvbSIsIm5vdGlmaWNhdGlvbnMiLCJhZGRFcnJvciIsIlN0cmluZyIsInJlbW92ZSIsInBlbmRpbmdTYXZlIiwiYWRkIiwibmV3U3RhdGUiLCJpc0VkaXRpbmciLCJfc3RhcnRFZGl0IiwiX2dldFZhbHVlQXNTdHJpbmciLCJnZXRWYWx1ZSIsInR5cGUiLCJTVFJJTkdfUkVHRVgiLCJ0ZXN0IiwiX3NldEVkaXRvckdyYW1tYXIiLCJlZGl0b3IiLCJncmFtbWFyTmFtZSIsImdyYW1tYXIiLCJncmFtbWFycyIsImdyYW1tYXJGb3JTY29wZU5hbWUiLCJnZXRUZXh0RWRpdG9yIiwic2V0R3JhbW1hciIsIl9yZW5kZXJFZGl0VmlldyIsInRyaW0iLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwiYmluZCIsImNvbXBvbmVudERpZE1vdW50IiwiY29tcG9uZW50V2lsbFVubW91bnQiLCJkaXNwb3NlIiwiX3JlbmRlckVkaXRIb3ZlckNvbnRyb2xzIiwiXyIsInJlbmRlciIsImlzRWRpdGFibGUiLCJwZW5kaW5nQ2hpbGRyZW5Ob2RlIiwiaXNQZW5kaW5nIiwiaXNFcnJvciIsInRvU3RyaW5nIiwiRXhwcmVzc2lvblRyZWVDb21wb25lbnQiLCJfZ2V0RXhwYW5zaW9uQ2FjaGUiLCJjYWNoZSIsImNvbnRhaW5lckNvbnRleHQiLCJNYXAiLCJjbGFzc05hbWUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFHQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFFQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxvQkFBb0IsR0FBRyxzQkFBN0I7QUFDQSxNQUFNQyxxQkFBcUIsR0FBRyxpQkFBOUI7QUFDQSxNQUFNQyxhQUFhLEdBQUcsR0FBdEI7QUFBMEI7QUFFMUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBQ0EsTUFBTUMsZUFBc0QsR0FBRyxJQUFJQyxPQUFKLEVB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LGtCQUFEO0FBQ0UsTUFBQSxVQUFVLEVBQUUsS0FBS2xHLEtBQUwsQ0FBV08sVUFEekI7QUFFRSxNQUFBLE9BQU8sRUFBRSxLQUFLUCxLQUFMLENBQVdNLE9BRnRCO0FBR0UsTUFBQSxRQUFRLEVBQUMsTUFIWDtBQUlFLE1BQUEsY0FBYyxFQUFFLEtBQUt3RixrQkFBTCxFQUpsQjtBQUtFLE1BQUEsa0JBQWtCLEVBQUUsS0FBSzlGLEtBQUwsQ0FBV3FDLGtCQUxqQztBQU1FLE1BQUEsUUFBUSxFQUFFLEtBQUtyQyxLQUFMLENBQVcrQztBQU52QixNQURGLENBREY7QUFZRDs7QUE5QndGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBJRXhwcmVzc2lvbiwgSVZhcmlhYmxlIH0gZnJvbSBcImF0b20taWRlLXVpXCJcclxuaW1wb3J0IHR5cGUgeyBFeHBlY3RlZCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9leHBlY3RlZFwiXHJcblxyXG5pbXBvcnQgeyBBdG9tSW5wdXQgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvQXRvbUlucHV0XCJcclxuaW1wb3J0IHsgSWNvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9JY29uXCJcclxuaW1wb3J0IHsgdHJhY2sgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvYW5hbHl0aWNzXCJcclxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcclxuaW1wb3J0IGNsYXNzbmFtZXMgZnJvbSBcImNsYXNzbmFtZXNcIlxyXG5pbXBvcnQgeyBFeHBlY3QgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXhwZWN0ZWRcIlxyXG5pbXBvcnQgaWdub3JlVGV4dFNlbGVjdGlvbkV2ZW50cyBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvaWdub3JlVGV4dFNlbGVjdGlvbkV2ZW50c1wiXHJcbmltcG9ydCBpbnZhcmlhbnQgZnJvbSBcImFzc2VydFwiXHJcbmltcG9ydCBudWxsdGhyb3dzIGZyb20gXCJudWxsdGhyb3dzXCJcclxuaW1wb3J0IHsgTG9hZGluZ1NwaW5uZXIgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvTG9hZGluZ1NwaW5uZXJcIlxyXG5pbXBvcnQgeyBPYnNlcnZhYmxlIH0gZnJvbSBcInJ4anMtY29tcGF0L2J1bmRsZXMvcnhqcy1jb21wYXQudW1kLm1pbi5qc1wiXHJcbmltcG9ydCBTaW1wbGVWYWx1ZUNvbXBvbmVudCBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvU2ltcGxlVmFsdWVDb21wb25lbnRcIlxyXG5pbXBvcnQgeyBTVFJJTkdfUkVHRVggfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvU2ltcGxlVmFsdWVDb21wb25lbnRcIlxyXG5pbXBvcnQgeyBUcmVlTGlzdCwgVHJlZUl0ZW0sIE5lc3RlZFRyZWVJdGVtIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL1RyZWVcIlxyXG5pbXBvcnQgVW5pdmVyc2FsRGlzcG9zYWJsZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvVW5pdmVyc2FsRGlzcG9zYWJsZVwiXHJcbmltcG9ydCB7IFZhbHVlQ29tcG9uZW50Q2xhc3NOYW1lcyB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9WYWx1ZUNvbXBvbmVudENsYXNzTmFtZXNcIlxyXG5cclxuY29uc3QgRURJVF9WQUxVRV9GUk9NX0lDT04gPSBcImVkaXQtdmFsdWUtZnJvbS1pY29uXCJcclxuY29uc3QgTk9UX0FWQUlMQUJMRV9NRVNTQUdFID0gXCI8bm90IGF2YWlsYWJsZT5cIlxyXG5jb25zdCBTUElOTkVSX0RFTEFZID0gMjAwIC8qIG1zICovXHJcblxyXG4vLyBUaGlzIHdlYWsgbWFwIHRyYWNrcyB3aGljaCBub2RlIHBhdGgocykgYXJlIGV4cGFuZGVkIGluIGEgcmVjdXJzaXZlIGV4cHJlc3Npb25cclxuLy8gdmFsdWUgdHJlZS4gVGhlc2UgbXVzdCBiZSB0cmFja2VkIG91dHNpZGUgb2YgdGhlIFJlYWN0IG9iamVjdHMgdGhlbXNlbHZlcywgYmVjYXVzZVxyXG4vLyBleHBhbnNpb24gc3RhdGUgaXMgcGVyc2lzdGVkIGV2ZW4gaWYgdGhlIHRyZWUgaXMgZGVzdHJveWVkIGFuZCByZWNyZWF0ZWQgKHN1Y2ggYXMgd2hlblxyXG4vLyBzdGVwcGluZyBpbiBhIGRlYnVnZ2VyKS4gVGhlIHJvb3Qgb2YgZWFjaCB0cmVlIGhhcyBhIGNvbnRleHQsIHdoaWNoIGlzIGJhc2VkIG9uIHRoZVxyXG4vLyBjb21wb25lbnQgdGhhdCBjb250YWlucyB0aGUgdHJlZSAoc3VjaCBhcyBhIGRlYnVnZ2VyIHBhbmUsIHRvb2x0aXAgb3IgY29uc29sZSBwYW5lKS5cclxuLy8gV2hlbiB0aGF0IGNvbXBvbmVudCBpcyBkZXN0cm95ZWQsIHRoZSBXZWFrTWFwIHdpbGwgcmVtb3ZlIHRoZSBleHBhbnNpb24gc3RhdGUgaW5mb3JtYXRpb25cclxuLy8gZm9yIHRoZSBlbnRpcmUgdHJlZS5cclxuY29uc3QgRXhwYW5zaW9uU3RhdGVzOiBXZWFrTWFwPE9iamVjdCwgTWFwPHN0cmluZywgYm9vbGVhbj4+ID0gbmV3IFdlYWtNYXAoKVxyXG5cclxudHlwZSBFeHByZXNzaW9uVHJlZU5vZGVQcm9wcyA9IHtcclxuICBleHByZXNzaW9uOiBJRXhwcmVzc2lvbixcclxuICBwZW5kaW5nPzogYm9vbGVhbixcclxuICBleHBhbnNpb25DYWNoZTogTWFwPHN0cmluZywgYm9vbGVhbj4sXHJcbiAgbm9kZVBhdGg6IHN0cmluZyxcclxuICBoaWRlRXhwcmVzc2lvbk5hbWU/OiBib29sZWFuLFxyXG4gIHJlYWRPbmx5PzogYm9vbGVhbixcclxufVxyXG5cclxudHlwZSBFeHByZXNzaW9uVHJlZU5vZGVTdGF0ZSA9IHtcclxuICBleHBhbmRlZDogYm9vbGVhbixcclxuICBjaGlsZHJlbjogRXhwZWN0ZWQ8SUV4cHJlc3Npb25bXT4sXHJcbiAgaXNFZGl0aW5nOiBib29sZWFuLFxyXG4gIHBlbmRpbmdWYWx1ZTogP3N0cmluZyxcclxuICBwZW5kaW5nU2F2ZTogYm9vbGVhbixcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEV4cHJlc3Npb25UcmVlTm9kZSBleHRlbmRzIFJlYWN0LkNvbXBvbmVudDxFeHByZXNzaW9uVHJlZU5vZGVQcm9wcywgRXhwcmVzc2lvblRyZWVOb2RlU3RhdGU+IHtcclxuICBzdGF0ZTogRXhwcmVzc2lvblRyZWVOb2RlU3RhdGVcclxuICBfdG9nZ2xlTm9kZUV4cGFuZGVkOiAoZTogU3ludGhldGljTW91c2VFdmVudDw+KSA9PiB2b2lkXHJcbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXHJcbiAgX3N1YnNjcmlwdGlvbjogP3J4anMkSVN1YnNjcmlwdGlvblxyXG5cclxuICBjb25zdHJ1Y3Rvcihwcm9wczogRXhwcmVzc2lvblRyZWVOb2RlUHJvcHMpIHtcclxuICAgIHN1cGVyKHByb3BzKVxyXG4gICAgdGhpcy5fc3Vic2NyaXB0aW9uID0gbnVsbFxyXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXHJcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoKCkgPT4ge1xyXG4gICAgICBpZiAodGhpcy5fc3Vic2NyaXB0aW9uICE9IG51bGwpIHtcclxuICAgICAgICB0aGlzLl9zdWJzY3JpcHRpb24udW5zdWJzY3JpYmUoKVxyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gICAgdGhpcy5fdG9nZ2xlTm9kZUV4cGFuZGVkID0gaWdub3JlVGV4dFNlbGVjdGlvbkV2ZW50cyh0aGlzLl90b2dnbGVFeHBhbmQuYmluZCh0aGlzKSlcclxuICAgIHRoaXMuc3RhdGUgPSB7XHJcbiAgICAgIGV4cGFuZGVkOiB0aGlzLl9pc0V4cGFuZGVkKCksXHJcbiAgICAgIGNoaWxkcmVuOiBFeHBlY3QucGVuZGluZygpLFxyXG4gICAgICBpc0VkaXRpbmc6IGZhbHNlLFxyXG4gICAgICBwZW5kaW5nVmFsdWU6IG51bGwsXHJcbiAgICAgIHBlbmRpbmdTYXZlOiBmYWxzZSxcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGNvbXBvbmVudERpZE1vdW50KCk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMuc3RhdGUuZXhwYW5kZWQpIHtcclxuICAgICAgdGhpcy5fZmV0Y2hDaGlsZHJlbigpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjb21wb25lbnRXaWxsVW5tb3VudCgpOiB2b2lkIHtcclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxyXG4gIH1cclxuXHJcbiAgX2lzRXhwYW5kYWJsZSA9ICgpOiBib29sZWFuID0+IHtcclxuICAgIGlmICh0aGlzLnByb3BzLnBlbmRpbmcpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5wcm9wcy5leHByZXNzaW9uLmhhc0NoaWxkcmVuKClcclxuICB9XHJcblxyXG4gIF9pc0V4cGFuZGVkID0gKCk6IGJvb2xlYW4gPT4ge1xyXG4gICAgaWYgKCF0aGlzLl9pc0V4cGFuZGFibGUoKSkge1xyXG4gICAgICByZXR1cm4gZmFsc2VcclxuICAgIH1cclxuICAgIGNvbnN0IHsgZXhwYW5zaW9uQ2FjaGUsIG5vZGVQYXRoIH0gPSB0aGlzLnByb3BzXHJcbiAgICByZXR1cm4gQm9vbGVhbihleHBhbnNpb25DYWNoZS5nZXQobm9kZVBhdGgpKVxyXG4gIH1cclxuXHJcbiAgX3NldEV4cGFuZGVkID0gKGV4cGFuZGVkOiBib29sZWFuKSA9PiB7XHJcbiAgICBjb25zdCB7IGV4cGFuc2lvbkNhY2hlLCBub2RlUGF0aCB9ID0gdGhpcy5wcm9wc1xyXG4gICAgZXhwYW5zaW9uQ2FjaGUuc2V0KG5vZGVQYXRoLCBleHBhbmRlZClcclxuXHJcbiAgICBpZiAoZXhwYW5kZWQpIHtcclxuICAgICAgdGhpcy5fZmV0Y2hDaGlsZHJlbigpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLl9zdG9wRmV0Y2hpbmdDaGlsZHJlbigpXHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5zZXRTdGF0ZSh7XHJcbiAgICAgIGV4cGFuZGVkLFxyXG4gICAgfSlcclxuICB9XHJcblxyXG4gIF9zdG9wRmV0Y2hpbmdDaGlsZHJlbiA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICh0aGlzLl9zdWJzY3JpcHRpb24gIT0gbnVsbCkge1xyXG4gICAgICB0aGlzLl9zdWJzY3JpcHRpb24udW5zdWJzY3JpYmUoKVxyXG4gICAgICB0aGlzLl9zdWJzY3JpcHRpb24gPSBudWxsXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBfZmV0Y2hDaGlsZHJlbiA9ICgpOiB2b2lkID0+IHtcclxuICAgIHRoaXMuX3N0b3BGZXRjaGluZ0NoaWxkcmVuKClcclxuXHJcbiAgICBpZiAodGhpcy5faXNFeHBhbmRhYmxlKCkpIHtcclxuICAgICAgdGhpcy5fc3Vic2NyaXB0aW9uID0gT2JzZXJ2YWJsZS5mcm9tUHJvbWlzZSh0aGlzLnByb3BzLmV4cHJlc3Npb24uZ2V0Q2hpbGRyZW4oKSlcclxuICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiBPYnNlcnZhYmxlLm9mKFtdKSlcclxuICAgICAgICAubWFwKChjaGlsZHJlbikgPT4gRXhwZWN0LnZhbHVlKCgoY2hpbGRyZW46IGFueSk6IElFeHByZXNzaW9uW10pKSlcclxuICAgICAgICAuc3RhcnRXaXRoKEV4cGVjdC5wZW5kaW5nKCkpXHJcbiAgICAgICAgLnN1YnNjcmliZSgoY2hpbGRyZW4pID0+IHtcclxuICAgICAgICAgIHRoaXMuc2V0U3RhdGUoe1xyXG4gICAgICAgICAgICBjaGlsZHJlbixcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfSlcclxuICAgIH1cclxuICB9XHJcblxyXG4gIF90b2dnbGVFeHBhbmQgPSAoZXZlbnQ6IFN5bnRoZXRpY01vdXNlRXZlbnQ8Pik6IHZvaWQgPT4ge1xyXG4gICAgdGhpcy5fc2V0RXhwYW5kZWQoIXRoaXMuc3RhdGUuZXhwYW5kZWQpXHJcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKVxyXG4gIH1cclxuXHJcbiAgX3JlbmRlclZhbHVlTGluZSA9IChcclxuICAgIGV4cHJlc3Npb246IFJlYWN0LkVsZW1lbnQ8YW55PiB8ID9zdHJpbmcsXHJcbiAgICB2YWx1ZTogUmVhY3QuRWxlbWVudDxhbnk+IHwgc3RyaW5nXHJcbiAgKTogUmVhY3QuRWxlbWVudDxhbnk+ID0+IHtcclxuICAgIGlmIChleHByZXNzaW9uID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuIDxkaXYgY2xhc3NOYW1lPVwibnVjbGlkZS11aS1leHByZXNzaW9uLXRyZWUtdmFsdWUtY29udGFpbmVyIG5hdGl2ZS1rZXktYmluZGluZ3NcIj57dmFsdWV9PC9kaXY+XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gdGhpcy5wcm9wcy5oaWRlRXhwcmVzc2lvbk5hbWUgPyAoXHJcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJudWNsaWRlLXVpLWxhenktbmVzdGVkLXZhbHVlLWNvbnRhaW5lciBuYXRpdmUta2V5LWJpbmRpbmdzXCI+e3ZhbHVlfTwvZGl2PlxyXG4gICAgICApIDogKFxyXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibnVjbGlkZS11aS1sYXp5LW5lc3RlZC12YWx1ZS1jb250YWluZXIgbmF0aXZlLWtleS1iaW5kaW5nc1wiPlxyXG4gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXtWYWx1ZUNvbXBvbmVudENsYXNzTmFtZXMuaWRlbnRpZmllcn0+e2V4cHJlc3Npb259PC9zcGFuPjoge3ZhbHVlfVxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICApXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBfcmVuZGVyQ2hpbGQgPSAoY2hpbGQ6IElFeHByZXNzaW9uKTogUmVhY3QuTm9kZSA9PiB7XHJcbiAgICBjb25zdCBub2RlUGF0aCA9IHRoaXMucHJvcHMubm9kZVBhdGggKyBcIi9cIiArIGNoaWxkLm5hbWVcclxuICAgIHJldHVybiAoXHJcbiAgICAgIDxUcmVlSXRlbSBrZXk9e25vZGVQYXRofT5cclxuICAgICAgICA8RXhwcmVzc2lvblRyZWVOb2RlIGV4cHJlc3Npb249e2NoaWxkfSBleHBhbnNpb25DYWNoZT17dGhpcy5wcm9wcy5leHBhbnNpb25DYWNoZX0gbm9kZVBhdGg9e25vZGVQYXRofSAvPlxyXG4gICAgICA8L1RyZWVJdGVtPlxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgX2dldFZhcmlhYmxlRXhwcmVzc2lvbigpOiA/SVZhcmlhYmxlIHtcclxuICAgIGNvbnN0IHsgZXhwcmVzc2lvbiB9ID0gdGhpcy5wcm9wc1xyXG4gICAgcmV0dXJuIChleHByZXNzaW9uOiBhbnkpLmNhblNldFZhcmlhYmxlID09IG51bGwgfHwgKGV4cHJlc3Npb246IGFueSkuc2V0VmFyaWFibGUgPT0gbnVsbCA/IG51bGwgOiAoZXhwcmVzc2lvbjogYW55KVxyXG4gIH1cclxuXHJcbiAgX2lzRWRpdGFibGUgPSAoKTogYm9vbGVhbiA9PiB7XHJcbiAgICBjb25zdCB2YXJpYWJsZSA9IHRoaXMuX2dldFZhcmlhYmxlRXhwcmVzc2lvbigpXHJcbiAgICByZXR1cm4gdmFyaWFibGUgIT0gbnVsbCAmJiB2YXJpYWJsZS5jYW5TZXRWYXJpYWJsZSgpICYmICF0aGlzLnByb3BzLnJlYWRPbmx5XHJcbiAgfVxyXG5cclxuICBfdXBkYXRlVmFsdWUgPSAoKTogdm9pZCA9PiB7XHJcbiAgICBjb25zdCB7IHBlbmRpbmdWYWx1ZSB9ID0gdGhpcy5zdGF0ZVxyXG4gICAgY29uc3QgdmFyaWFibGUgPSBudWxsdGhyb3dzKHRoaXMuX2dldFZhcmlhYmxlRXhwcmVzc2lvbigpKVxyXG5cclxuICAgIGNvbnN0IGRvRWRpdCA9IHBlbmRpbmdWYWx1ZSAhPSBudWxsXHJcbiAgICB0aGlzLl9jYW5jZWxFZGl0KGRvRWRpdClcclxuXHJcbiAgICBpZiAoZG9FZGl0KSB7XHJcbiAgICAgIGludmFyaWFudChwZW5kaW5nVmFsdWUgIT0gbnVsbClcclxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gT2JzZXJ2YWJsZS5mcm9tUHJvbWlzZSh2YXJpYWJsZS5zZXRWYXJpYWJsZShwZW5kaW5nVmFsdWUpKVxyXG4gICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcclxuICAgICAgICAgIGlmIChlcnJvciAhPSBudWxsICYmIGVycm9yLm1lc3NhZ2UgIT0gbnVsbCkge1xyXG4gICAgICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoYEZhaWxlZCB0byBzZXQgdmFyaWFibGUgdmFsdWU6ICR7U3RyaW5nKGVycm9yLm1lc3NhZ2UpfWApXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5vZihudWxsKVxyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLnN1YnNjcmliZSgoKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLl9kaXNwb3NhYmxlcy5yZW1vdmUoc3Vic2NyaXB0aW9uKVxyXG4gICAgICAgICAgdGhpcy5zZXRTdGF0ZSh7XHJcbiAgICAgICAgICAgIHBlbmRpbmdTYXZlOiBmYWxzZSxcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfSlcclxuXHJcbiAgICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChzdWJzY3JpcHRpb24pXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBfY2FuY2VsRWRpdCA9IChwZW5kaW5nU2F2ZTogP2Jvb2xlYW4gPSBmYWxzZSk6IHZvaWQgPT4ge1xyXG4gICAgY29uc3QgbmV3U3RhdGU6IE9iamVjdCA9IHtcclxuICAgICAgaXNFZGl0aW5nOiBmYWxzZSxcclxuICAgICAgcGVuZGluZ1ZhbHVlOiBudWxsLFxyXG4gICAgfVxyXG4gICAgaWYgKHBlbmRpbmdTYXZlICE9IG51bGwpIHtcclxuICAgICAgbmV3U3RhdGUucGVuZGluZ1NhdmUgPSBwZW5kaW5nU2F2ZVxyXG4gICAgfVxyXG4gICAgdGhpcy5zZXRTdGF0ZShuZXdTdGF0ZSlcclxuICB9XHJcblxyXG4gIF9zdGFydEVkaXQgPSAoKTogdm9pZCA9PiB7XHJcbiAgICB0aGlzLnNldFN0YXRlKHtcclxuICAgICAgaXNFZGl0aW5nOiB0cnVlLFxyXG4gICAgICBwZW5kaW5nVmFsdWU6IG51bGwsXHJcbiAgICAgIHBlbmRpbmdTYXZlOiBmYWxzZSxcclxuICAgIH0pXHJcbiAgfVxyXG5cclxuICBfZ2V0VmFsdWVBc1N0cmluZyA9IChleHByZXNzaW9uOiBJRXhwcmVzc2lvbik6IHN0cmluZyA9PiB7XHJcbiAgICBjb25zdCB2YWx1ZSA9IGV4cHJlc3Npb24uZ2V0VmFsdWUoKVxyXG4gICAgaWYgKHZhbHVlICE9IG51bGwgJiYgZXhwcmVzc2lvbi50eXBlID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgIHJldHVybiBTVFJJTkdfUkVHRVgudGVzdCh2YWx1ZSkgPyB2YWx1ZSA6IGBcIiR7dmFsdWV9XCJgXHJcbiAgICB9XHJcbiAgICByZXR1cm4gdmFsdWUgfHwgXCJcIlxyXG4gIH1cclxuXHJcbiAgX3NldEVkaXRvckdyYW1tYXIgPSAoZWRpdG9yOiA/QXRvbUlucHV0KTogdm9pZCA9PiB7XHJcbiAgICBpZiAoZWRpdG9yID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdmFyaWFibGUgPSB0aGlzLl9nZXRWYXJpYWJsZUV4cHJlc3Npb24oKVxyXG4gICAgaWYgKHZhcmlhYmxlID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHZhcmlhYmxlLmdyYW1tYXJOYW1lICE9IG51bGwgJiYgdmFyaWFibGUuZ3JhbW1hck5hbWUgIT09IFwiXCIpIHtcclxuICAgICAgY29uc3QgZ3JhbW1hciA9IGF0b20uZ3JhbW1hcnMuZ3JhbW1hckZvclNjb3BlTmFtZSh2YXJpYWJsZS5ncmFtbWFyTmFtZSlcclxuICAgICAgaWYgKGdyYW1tYXIgPT0gbnVsbCkge1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcbiAgICAgIGVkaXRvci5nZXRUZXh0RWRpdG9yKCkuc2V0R3JhbW1hcihncmFtbWFyKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgX3JlbmRlckVkaXRWaWV3ID0gKGV4cHJlc3Npb246IElFeHByZXNzaW9uKTogUmVhY3QuRWxlbWVudDxhbnk+ID0+IHtcclxuICAgIHJldHVybiAoXHJcbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZXhwcmVzc2lvbi10cmVlLWxpbmUtY29udHJvbFwiPlxyXG4gICAgICAgIDxBdG9tSW5wdXRcclxuICAgICAgICAgIGNsYXNzTmFtZT1cImV4cHJlc3Npb24tdHJlZS12YWx1ZS1ib3ggaW5saW5lLWJsb2NrXCJcclxuICAgICAgICAgIHNpemU9XCJzbVwiXHJcbiAgICAgICAgICBhdXRvZm9jdXM9e3RydWV9XHJcbiAgICAgICAgICBzdGFydFNlbGVjdGVkPXtmYWxzZX1cclxuICAgICAgICAgIGluaXRpYWxWYWx1ZT17dGhpcy5fZ2V0VmFsdWVBc1N0cmluZyhleHByZXNzaW9uKX1cclxuICAgICAgICAgIG9uRGlkQ2hhbmdlPXsocGVuZGluZ1ZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoeyBwZW5kaW5nVmFsdWU6IHBlbmRpbmdWYWx1ZS50cmltKCkgfSlcclxuICAgICAgICAgIH19XHJcbiAgICAgICAgICBvbkNvbmZpcm09e3RoaXMuX3VwZGF0ZVZhbHVlfVxyXG4gICAgICAgICAgb25DYW5jZWw9eygpID0+IHRoaXMuX2NhbmNlbEVkaXQoKX1cclxuICAgICAgICAgIG9uQmx1cj17KCkgPT4gdGhpcy5fY2FuY2VsRWRpdCgpfVxyXG4gICAgICAgICAgcmVmPXt0aGlzLl9zZXRFZGl0b3JHcmFtbWFyfVxyXG4gICAgICAgIC8+XHJcbiAgICAgICAgPEljb25cclxuICAgICAgICAgIGljb249XCJjaGVja1wiXHJcbiAgICAgICAgICB0aXRsZT1cIlNhdmUgY2hhbmdlc1wiXHJcbiAgICAgICAgICBjbGFzc05hbWU9XCJleHByZXNzaW9uLXRyZWUtZWRpdC1idXR0b24tY29uZmlybVwiXHJcbiAgICAgICAgICBvbkNsaWNrPXt0aGlzLl91cGRhdGVWYWx1ZX1cclxuICAgICAgICAvPlxyXG4gICAgICAgIDxJY29uXHJcbiAgICAgICAgICBpY29uPVwieFwiXHJcbiAgICAgICAgICB0aXRsZT1cIkNhbmNlbCBjaGFuZ2VzXCJcclxuICAgICAgICAgIGNsYXNzTmFtZT1cImV4cHJlc3Npb24tdHJlZS1lZGl0LWJ1dHRvbi1jYW5jZWxcIlxyXG4gICAgICAgICAgb25DbGljaz17dGhpcy5fY2FuY2VsRWRpdH1cclxuICAgICAgICAvPlxyXG4gICAgICA8L2Rpdj5cclxuICAgIClcclxuICB9XHJcblxyXG4gIF9yZW5kZXJFZGl0SG92ZXJDb250cm9scygpOiA/UmVhY3QuRWxlbWVudDxhbnk+IHtcclxuICAgIGlmICghdGhpcy5faXNFZGl0YWJsZSgpIHx8IHRoaXMuc3RhdGUuaXNFZGl0aW5nKSB7XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcbiAgICByZXR1cm4gKFxyXG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXNjb3Blcy12aWV3LWNvbnRyb2xzXCI+XHJcbiAgICAgICAgPEljb25cclxuICAgICAgICAgIGljb249XCJwZW5jaWxcIlxyXG4gICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItc2NvcGVzLXZpZXctZWRpdC1jb250cm9sXCJcclxuICAgICAgICAgIG9uQ2xpY2s9eyhfKSA9PiB7XHJcbiAgICAgICAgICAgIHRyYWNrKEVESVRfVkFMVUVfRlJPTV9JQ09OKVxyXG4gICAgICAgICAgICB0aGlzLl9zdGFydEVkaXQoKVxyXG4gICAgICAgICAgfX1cclxuICAgICAgICAvPlxyXG4gICAgICA8L2Rpdj5cclxuICAgIClcclxuICB9XHJcblxyXG4gIHJlbmRlcigpOiBSZWFjdC5Ob2RlIHtcclxuICAgIGNvbnN0IHsgcGVuZGluZywgZXhwcmVzc2lvbiB9ID0gdGhpcy5wcm9wc1xyXG4gICAgY29uc3QgeyBwZW5kaW5nU2F2ZSB9ID0gdGhpcy5zdGF0ZVxyXG4gICAgaWYgKHBlbmRpbmcgfHwgcGVuZGluZ1NhdmUpIHtcclxuICAgICAgLy8gVmFsdWUgbm90IGF2YWlsYWJsZSB5ZXQuIFNob3cgYSBkZWxheWVkIGxvYWRpbmcgc3Bpbm5lci5cclxuICAgICAgcmV0dXJuIChcclxuICAgICAgICA8VHJlZUl0ZW0gY2xhc3NOYW1lPVwibnVjbGlkZS11aS1leHByZXNzaW9uLXRyZWUtdmFsdWUtc3Bpbm5lclwiPlxyXG4gICAgICAgICAgPExvYWRpbmdTcGlubmVyIHNpemU9XCJFWFRSQV9TTUFMTFwiIGRlbGF5PXtTUElOTkVSX0RFTEFZfSAvPlxyXG4gICAgICAgIDwvVHJlZUl0ZW0+XHJcbiAgICAgIClcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBpc0VkaXRhYmxlID0gdGhpcy5faXNFZGl0YWJsZSgpXHJcbiAgICBpZiAoIXRoaXMuX2lzRXhwYW5kYWJsZSgpKSB7XHJcbiAgICAgIC8vIFRoaXMgaXMgYSBzaW1wbGUgdmFsdWUgd2l0aCBubyBjaGlsZHJlbi5cclxuICAgICAgcmV0dXJuIChcclxuICAgICAgICA8ZGl2XHJcbiAgICAgICAgICBvbkRvdWJsZUNsaWNrPXtpc0VkaXRhYmxlICYmICF0aGlzLnN0YXRlLmlzRWRpdGluZyA/IHRoaXMuX3N0YXJ0RWRpdCA6ICgpID0+IHt9fVxyXG4gICAgICAgICAgY2xhc3NOYW1lPVwiZXhwcmVzc2lvbi10cmVlLWxpbmUtY29udHJvbFwiXHJcbiAgICAgICAgPlxyXG4gICAgICAgICAge3RoaXMuc3RhdGUuaXNFZGl0aW5nID8gKFxyXG4gICAgICAgICAgICB0aGlzLl9yZW5kZXJFZGl0VmlldyhleHByZXNzaW9uKVxyXG4gICAgICAgICAgKSA6IChcclxuICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwibmF0aXZlLWtleS1iaW5kaW5ncyBleHByZXNzaW9uLXRyZWUtdmFsdWUtYm94XCI+XHJcbiAgICAgICAgICAgICAgPFNpbXBsZVZhbHVlQ29tcG9uZW50IGV4cHJlc3Npb249e2V4cHJlc3Npb259IC8+XHJcbiAgICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICAgICl9XHJcbiAgICAgICAgICB7aXNFZGl0YWJsZSA/IHRoaXMuX3JlbmRlckVkaXRIb3ZlckNvbnRyb2xzKCkgOiBudWxsfVxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICApXHJcbiAgICB9XHJcblxyXG4gICAgLy8gQSBub2RlIHdpdGggYSBkZWxheWVkIHNwaW5uZXIgdG8gZGlzcGxheSBpZiB3ZSdyZSBleHBhbmRlZCwgYnV0IHdhaXRpbmcgZm9yXHJcbiAgICAvLyBjaGlsZHJlbiB0byBiZSBmZXRjaGVkLlxyXG4gICAgY29uc3QgcGVuZGluZ0NoaWxkcmVuTm9kZSA9IChcclxuICAgICAgPEV4cHJlc3Npb25UcmVlTm9kZVxyXG4gICAgICAgIGV4cHJlc3Npb249e3RoaXMucHJvcHMuZXhwcmVzc2lvbn1cclxuICAgICAgICBwZW5kaW5nPXt0cnVlfVxyXG4gICAgICAgIGV4cGFuc2lvbkNhY2hlPXt0aGlzLnByb3BzLmV4cGFuc2lvbkNhY2hlfVxyXG4gICAgICAgIG5vZGVQYXRoPXt0aGlzLnByb3BzLm5vZGVQYXRofVxyXG4gICAgICAvPlxyXG4gICAgKVxyXG5cclxuICAgIC8vIElmIGNvbGxhcHNlZCwgcmVuZGVyIG5vIGNoaWxkcmVuLiBPdGhlcndpc2UgZWl0aGVyIHJlbmRlciB0aGUgcGVuZGluZ0NoaWxkcmVuTm9kZVxyXG4gICAgLy8gaWYgdGhlIGZldGNoIGhhc24ndCBjb21wbGV0ZWQsIG9yIHRoZSBjaGlsZHJlbiBpZiB3ZSd2ZSBnb3QgdGhlbS5cclxuICAgIGxldCBjaGlsZHJlblxyXG4gICAgaWYgKCF0aGlzLnN0YXRlLmV4cGFuZGVkKSB7XHJcbiAgICAgIGNoaWxkcmVuID0gbnVsbFxyXG4gICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlLmNoaWxkcmVuLmlzUGVuZGluZykge1xyXG4gICAgICBjaGlsZHJlbiA9IHBlbmRpbmdDaGlsZHJlbk5vZGVcclxuICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZS5jaGlsZHJlbi5pc0Vycm9yKSB7XHJcbiAgICAgIGNoaWxkcmVuID0gdGhpcy5fcmVuZGVyVmFsdWVMaW5lKFxyXG4gICAgICAgIFwiQ2hpbGRyZW5cIixcclxuICAgICAgICB0aGlzLnN0YXRlLmNoaWxkcmVuLmVycm9yICE9IG51bGwgPyB0aGlzLnN0YXRlLmNoaWxkcmVuLmVycm9yLnRvU3RyaW5nKCkgOiBOT1RfQVZBSUxBQkxFX01FU1NBR0VcclxuICAgICAgKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY2hpbGRyZW4gPSB0aGlzLnN0YXRlLmNoaWxkcmVuLnZhbHVlLm1hcCgoY2hpbGQpID0+IHRoaXMuX3JlbmRlckNoaWxkKGNoaWxkKSlcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gKFxyXG4gICAgICA8VHJlZUxpc3Qgc2hvd0Fycm93cz17dHJ1ZX0gY2xhc3NOYW1lPVwibnVjbGlkZS11aS1leHByZXNzaW9uLXRyZWUtdmFsdWUtdHJlZWxpc3RcIj5cclxuICAgICAgICA8TmVzdGVkVHJlZUl0ZW1cclxuICAgICAgICAgIGNvbGxhcHNlZD17IXRoaXMuc3RhdGUuZXhwYW5kZWR9XHJcbiAgICAgICAgICBvbkNvbmZpcm09e2lzRWRpdGFibGUgPyB0aGlzLl9zdGFydEVkaXQgOiAoKSA9PiB7fX1cclxuICAgICAgICAgIG9uU2VsZWN0PXt0aGlzLnN0YXRlLmlzRWRpdGluZyA/ICgpID0+IHt9IDogdGhpcy5fdG9nZ2xlTm9kZUV4cGFuZGVkfVxyXG4gICAgICAgICAgdGl0bGU9e1xyXG4gICAgICAgICAgICB0aGlzLnN0YXRlLmlzRWRpdGluZ1xyXG4gICAgICAgICAgICAgID8gdGhpcy5fcmVuZGVyRWRpdFZpZXcoZXhwcmVzc2lvbilcclxuICAgICAgICAgICAgICA6IHRoaXMuX3JlbmRlclZhbHVlTGluZShleHByZXNzaW9uLm5hbWUsIGV4cHJlc3Npb24uZ2V0VmFsdWUoKSlcclxuICAgICAgICAgIH1cclxuICAgICAgICA+XHJcbiAgICAgICAgICB7Y2hpbGRyZW59XHJcbiAgICAgICAgPC9OZXN0ZWRUcmVlSXRlbT5cclxuICAgICAgPC9UcmVlTGlzdD5cclxuICAgIClcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCB0eXBlIEV4cHJlc3Npb25UcmVlQ29tcG9uZW50UHJvcHMgPSB7XHJcbiAgZXhwcmVzc2lvbjogSUV4cHJlc3Npb24sXHJcbiAgY29udGFpbmVyQ29udGV4dDogT2JqZWN0LFxyXG4gIHBlbmRpbmc/OiBib29sZWFuLFxyXG4gIGNsYXNzTmFtZT86IHN0cmluZyxcclxuICBoaWRlRXhwcmVzc2lvbk5hbWU/OiBib29sZWFuLFxyXG4gIHJlYWRPbmx5PzogYm9vbGVhbixcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEV4cHJlc3Npb25UcmVlQ29tcG9uZW50IGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50PEV4cHJlc3Npb25UcmVlQ29tcG9uZW50UHJvcHM+IHtcclxuICBjb25zdHJ1Y3Rvcihwcm9wczogRXhwcmVzc2lvblRyZWVDb21wb25lbnRQcm9wcykge1xyXG4gICAgc3VwZXIocHJvcHMpXHJcbiAgfVxyXG5cclxuICBfZ2V0RXhwYW5zaW9uQ2FjaGUgPSAoKTogTWFwPHN0cmluZywgYm9vbGVhbj4gPT4ge1xyXG4gICAgbGV0IGNhY2hlID0gRXhwYW5zaW9uU3RhdGVzLmdldCh0aGlzLnByb3BzLmNvbnRhaW5lckNvbnRleHQpXHJcbiAgICBpZiAoY2FjaGUgPT0gbnVsbCkge1xyXG4gICAgICBjYWNoZSA9IG5ldyBNYXAoKVxyXG4gICAgICBFeHBhbnNpb25TdGF0ZXMuc2V0KHRoaXMucHJvcHMuY29udGFpbmVyQ29udGV4dCwgY2FjaGUpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gY2FjaGVcclxuICB9XHJcblxyXG4gIHJlbmRlcigpOiBSZWFjdC5Ob2RlIHtcclxuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGNsYXNzbmFtZXModGhpcy5wcm9wcy5jbGFzc05hbWUsIHtcclxuICAgICAgXCJudWNsaWRlLXVpLWV4cHJlc3Npb24tdHJlZS12YWx1ZVwiOiB0aGlzLnByb3BzLmNsYXNzTmFtZSA9PSBudWxsLFxyXG4gICAgfSlcclxuICAgIHJldHVybiAoXHJcbiAgICAgIDxzcGFuIGNsYXNzTmFtZT17Y2xhc3NOYW1lfSB0YWJJbmRleD17LTF9PlxyXG4gICAgICAgIDxFeHByZXNzaW9uVHJlZU5vZGVcclxuICAgICAgICAgIGV4cHJlc3Npb249e3RoaXMucHJvcHMuZXhwcmVzc2lvbn1cclxuICAgICAgICAgIHBlbmRpbmc9e3RoaXMucHJvcHMucGVuZGluZ31cclxuICAgICAgICAgIG5vZGVQYXRoPVwicm9vdFwiXHJcbiAgICAgICAgICBleHBhbnNpb25DYWNoZT17dGhpcy5fZ2V0RXhwYW5zaW9uQ2FjaGUoKX1cclxuICAgICAgICAgIGhpZGVFeHByZXNzaW9uTmFtZT17dGhpcy5wcm9wcy5oaWRlRXhwcmVzc2lvbk5hbWV9XHJcbiAgICAgICAgICByZWFkT25seT17dGhpcy5wcm9wcy5yZWFkT25seX1cclxuICAgICAgICAvPlxyXG4gICAgICA8L3NwYW4+XHJcbiAgICApXHJcbiAgfVxyXG59XHJcbiJdfQ==