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

var _rxjs = require("rxjs");

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
        this._subscription = _rxjs.Observable.fromPromise(this.props.expression.getChildren()).catch(error => _rxjs.Observable.of([])).map(children => _expected.Expect.value(children)).startWith(_expected.Expect.pending()).subscribe(children => {
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

        const subscription = _rxjs.Observable.fromPromise(variable.setVariable(pendingValue)).catch(error => {
          if (error != null && error.message != null) {
            atom.notifications.addError(`Failed to set variable value: ${String(error.message)}`);
          }

          return _rxjs.Observable.of(null);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkV4cHJlc3Npb25UcmVlQ29tcG9uZW50LmpzIl0sIm5hbWVzIjpbIkVESVRfVkFMVUVfRlJPTV9JQ09OIiwiTk9UX0FWQUlMQUJMRV9NRVNTQUdFIiwiU1BJTk5FUl9ERUxBWSIsIkV4cGFuc2lvblN0YXRlcyIsIldlYWtNYXAiLCJFeHByZXNzaW9uVHJlZU5vZGUiLCJSZWFjdCIsIkNvbXBvbmVudCIsImNvbnN0cnVjdG9yIiwicHJvcHMiLCJzdGF0ZSIsIl90b2dnbGVOb2RlRXhwYW5kZWQiLCJfZGlzcG9zYWJsZXMiLCJfc3Vic2NyaXB0aW9uIiwiX2lzRXhwYW5kYWJsZSIsInBlbmRpbmciLCJleHByZXNzaW9uIiwiaGFzQ2hpbGRyZW4iLCJfaXNFeHBhbmRlZCIsImV4cGFuc2lvbkNhY2hlIiwibm9kZVBhdGgiLCJCb29sZWFuIiwiZ2V0IiwiX3NldEV4cGFuZGVkIiwiZXhwYW5kZWQiLCJzZXQiLCJfZmV0Y2hDaGlsZHJlbiIsIl9zdG9wRmV0Y2hpbmdDaGlsZHJlbiIsInNldFN0YXRlIiwidW5zdWJzY3JpYmUiLCJPYnNlcnZhYmxlIiwiZnJvbVByb21pc2UiLCJnZXRDaGlsZHJlbiIsImNhdGNoIiwiZXJyb3IiLCJvZiIsIm1hcCIsImNoaWxkcmVuIiwiRXhwZWN0IiwidmFsdWUiLCJzdGFydFdpdGgiLCJzdWJzY3JpYmUiLCJfdG9nZ2xlRXhwYW5kIiwiZXZlbnQiLCJzdG9wUHJvcGFnYXRpb24iLCJfcmVuZGVyVmFsdWVMaW5lIiwiaGlkZUV4cHJlc3Npb25OYW1lIiwiVmFsdWVDb21wb25lbnRDbGFzc05hbWVzIiwiaWRlbnRpZmllciIsIl9yZW5kZXJDaGlsZCIsImNoaWxkIiwibmFtZSIsIl9pc0VkaXRhYmxlIiwidmFyaWFibGUiLCJfZ2V0VmFyaWFibGVFeHByZXNzaW9uIiwiY2FuU2V0VmFyaWFibGUiLCJyZWFkT25seSIsIl91cGRhdGVWYWx1ZSIsInBlbmRpbmdWYWx1ZSIsImRvRWRpdCIsIl9jYW5jZWxFZGl0Iiwic3Vic2NyaXB0aW9uIiwic2V0VmFyaWFibGUiLCJtZXNzYWdlIiwiYXRvbSIsIm5vdGlmaWNhdGlvbnMiLCJhZGRFcnJvciIsIlN0cmluZyIsInJlbW92ZSIsInBlbmRpbmdTYXZlIiwiYWRkIiwibmV3U3RhdGUiLCJpc0VkaXRpbmciLCJfc3RhcnRFZGl0IiwiX2dldFZhbHVlQXNTdHJpbmciLCJnZXRWYWx1ZSIsInR5cGUiLCJTVFJJTkdfUkVHRVgiLCJ0ZXN0IiwiX3NldEVkaXRvckdyYW1tYXIiLCJlZGl0b3IiLCJncmFtbWFyTmFtZSIsImdyYW1tYXIiLCJncmFtbWFycyIsImdyYW1tYXJGb3JTY29wZU5hbWUiLCJnZXRUZXh0RWRpdG9yIiwic2V0R3JhbW1hciIsIl9yZW5kZXJFZGl0VmlldyIsInRyaW0iLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwiYmluZCIsImNvbXBvbmVudERpZE1vdW50IiwiY29tcG9uZW50V2lsbFVubW91bnQiLCJkaXNwb3NlIiwiX3JlbmRlckVkaXRIb3ZlckNvbnRyb2xzIiwiXyIsInJlbmRlciIsImlzRWRpdGFibGUiLCJwZW5kaW5nQ2hpbGRyZW5Ob2RlIiwiaXNQZW5kaW5nIiwiaXNFcnJvciIsInRvU3RyaW5nIiwiRXhwcmVzc2lvblRyZWVDb21wb25lbnQiLCJfZ2V0RXhwYW5zaW9uQ2FjaGUiLCJjYWNoZSIsImNvbnRhaW5lckNvbnRleHQiLCJNYXAiLCJjbGFzc05hbWUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFHQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFFQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxvQkFBb0IsR0FBRyxzQkFBN0I7QUFDQSxNQUFNQyxxQkFBcUIsR0FBRyxpQkFBOUI7QUFDQSxNQUFNQyxhQUFhLEdBQUcsR0FBdEI7QUFBMEI7QUFFMUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBQ0EsTUFBTUMsZUFBc0QsR0FBRyxJQUFJQyxPQUFKLEVB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LGtCQUFEO0FBQ0UsTUFBQSxVQUFVLEVBQUUsS0FBS2xHLEtBQUwsQ0FBV08sVUFEekI7QUFFRSxNQUFBLE9BQU8sRUFBRSxLQUFLUCxLQUFMLENBQVdNLE9BRnRCO0FBR0UsTUFBQSxRQUFRLEVBQUMsTUFIWDtBQUlFLE1BQUEsY0FBYyxFQUFFLEtBQUt3RixrQkFBTCxFQUpsQjtBQUtFLE1BQUEsa0JBQWtCLEVBQUUsS0FBSzlGLEtBQUwsQ0FBV3FDLGtCQUxqQztBQU1FLE1BQUEsUUFBUSxFQUFFLEtBQUtyQyxLQUFMLENBQVcrQztBQU52QixNQURGLENBREY7QUFZRDs7QUE5QndGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBJRXhwcmVzc2lvbiwgSVZhcmlhYmxlIH0gZnJvbSBcImF0b20taWRlLXVpXCJcbmltcG9ydCB0eXBlIHsgRXhwZWN0ZWQgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXhwZWN0ZWRcIlxuXG5pbXBvcnQgeyBBdG9tSW5wdXQgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvQXRvbUlucHV0XCJcbmltcG9ydCB7IEljb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvSWNvblwiXG5pbXBvcnQgeyB0cmFjayB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9hbmFseXRpY3NcIlxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcbmltcG9ydCBjbGFzc25hbWVzIGZyb20gXCJjbGFzc25hbWVzXCJcbmltcG9ydCB7IEV4cGVjdCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9leHBlY3RlZFwiXG5pbXBvcnQgaWdub3JlVGV4dFNlbGVjdGlvbkV2ZW50cyBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvaWdub3JlVGV4dFNlbGVjdGlvbkV2ZW50c1wiXG5pbXBvcnQgaW52YXJpYW50IGZyb20gXCJhc3NlcnRcIlxuaW1wb3J0IG51bGx0aHJvd3MgZnJvbSBcIm51bGx0aHJvd3NcIlxuaW1wb3J0IHsgTG9hZGluZ1NwaW5uZXIgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvTG9hZGluZ1NwaW5uZXJcIlxuaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gXCJyeGpzXCJcbmltcG9ydCBTaW1wbGVWYWx1ZUNvbXBvbmVudCBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvU2ltcGxlVmFsdWVDb21wb25lbnRcIlxuaW1wb3J0IHsgU1RSSU5HX1JFR0VYIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL1NpbXBsZVZhbHVlQ29tcG9uZW50XCJcbmltcG9ydCB7IFRyZWVMaXN0LCBUcmVlSXRlbSwgTmVzdGVkVHJlZUl0ZW0gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvVHJlZVwiXG5pbXBvcnQgVW5pdmVyc2FsRGlzcG9zYWJsZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvVW5pdmVyc2FsRGlzcG9zYWJsZVwiXG5pbXBvcnQgeyBWYWx1ZUNvbXBvbmVudENsYXNzTmFtZXMgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvVmFsdWVDb21wb25lbnRDbGFzc05hbWVzXCJcblxuY29uc3QgRURJVF9WQUxVRV9GUk9NX0lDT04gPSBcImVkaXQtdmFsdWUtZnJvbS1pY29uXCJcbmNvbnN0IE5PVF9BVkFJTEFCTEVfTUVTU0FHRSA9IFwiPG5vdCBhdmFpbGFibGU+XCJcbmNvbnN0IFNQSU5ORVJfREVMQVkgPSAyMDAgLyogbXMgKi9cblxuLy8gVGhpcyB3ZWFrIG1hcCB0cmFja3Mgd2hpY2ggbm9kZSBwYXRoKHMpIGFyZSBleHBhbmRlZCBpbiBhIHJlY3Vyc2l2ZSBleHByZXNzaW9uXG4vLyB2YWx1ZSB0cmVlLiBUaGVzZSBtdXN0IGJlIHRyYWNrZWQgb3V0c2lkZSBvZiB0aGUgUmVhY3Qgb2JqZWN0cyB0aGVtc2VsdmVzLCBiZWNhdXNlXG4vLyBleHBhbnNpb24gc3RhdGUgaXMgcGVyc2lzdGVkIGV2ZW4gaWYgdGhlIHRyZWUgaXMgZGVzdHJveWVkIGFuZCByZWNyZWF0ZWQgKHN1Y2ggYXMgd2hlblxuLy8gc3RlcHBpbmcgaW4gYSBkZWJ1Z2dlcikuIFRoZSByb290IG9mIGVhY2ggdHJlZSBoYXMgYSBjb250ZXh0LCB3aGljaCBpcyBiYXNlZCBvbiB0aGVcbi8vIGNvbXBvbmVudCB0aGF0IGNvbnRhaW5zIHRoZSB0cmVlIChzdWNoIGFzIGEgZGVidWdnZXIgcGFuZSwgdG9vbHRpcCBvciBjb25zb2xlIHBhbmUpLlxuLy8gV2hlbiB0aGF0IGNvbXBvbmVudCBpcyBkZXN0cm95ZWQsIHRoZSBXZWFrTWFwIHdpbGwgcmVtb3ZlIHRoZSBleHBhbnNpb24gc3RhdGUgaW5mb3JtYXRpb25cbi8vIGZvciB0aGUgZW50aXJlIHRyZWUuXG5jb25zdCBFeHBhbnNpb25TdGF0ZXM6IFdlYWtNYXA8T2JqZWN0LCBNYXA8c3RyaW5nLCBib29sZWFuPj4gPSBuZXcgV2Vha01hcCgpXG5cbnR5cGUgRXhwcmVzc2lvblRyZWVOb2RlUHJvcHMgPSB7XG4gIGV4cHJlc3Npb246IElFeHByZXNzaW9uLFxuICBwZW5kaW5nPzogYm9vbGVhbixcbiAgZXhwYW5zaW9uQ2FjaGU6IE1hcDxzdHJpbmcsIGJvb2xlYW4+LFxuICBub2RlUGF0aDogc3RyaW5nLFxuICBoaWRlRXhwcmVzc2lvbk5hbWU/OiBib29sZWFuLFxuICByZWFkT25seT86IGJvb2xlYW4sXG59XG5cbnR5cGUgRXhwcmVzc2lvblRyZWVOb2RlU3RhdGUgPSB7XG4gIGV4cGFuZGVkOiBib29sZWFuLFxuICBjaGlsZHJlbjogRXhwZWN0ZWQ8SUV4cHJlc3Npb25bXT4sXG4gIGlzRWRpdGluZzogYm9vbGVhbixcbiAgcGVuZGluZ1ZhbHVlOiA/c3RyaW5nLFxuICBwZW5kaW5nU2F2ZTogYm9vbGVhbixcbn1cblxuZXhwb3J0IGNsYXNzIEV4cHJlc3Npb25UcmVlTm9kZSBleHRlbmRzIFJlYWN0LkNvbXBvbmVudDxFeHByZXNzaW9uVHJlZU5vZGVQcm9wcywgRXhwcmVzc2lvblRyZWVOb2RlU3RhdGU+IHtcbiAgc3RhdGU6IEV4cHJlc3Npb25UcmVlTm9kZVN0YXRlXG4gIF90b2dnbGVOb2RlRXhwYW5kZWQ6IChlOiBTeW50aGV0aWNNb3VzZUV2ZW50PD4pID0+IHZvaWRcbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXG4gIF9zdWJzY3JpcHRpb246ID9yeGpzJElTdWJzY3JpcHRpb25cblxuICBjb25zdHJ1Y3Rvcihwcm9wczogRXhwcmVzc2lvblRyZWVOb2RlUHJvcHMpIHtcbiAgICBzdXBlcihwcm9wcylcbiAgICB0aGlzLl9zdWJzY3JpcHRpb24gPSBudWxsXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLl9zdWJzY3JpcHRpb24gIT0gbnVsbCkge1xuICAgICAgICB0aGlzLl9zdWJzY3JpcHRpb24udW5zdWJzY3JpYmUoKVxuICAgICAgfVxuICAgIH0pXG4gICAgdGhpcy5fdG9nZ2xlTm9kZUV4cGFuZGVkID0gaWdub3JlVGV4dFNlbGVjdGlvbkV2ZW50cyh0aGlzLl90b2dnbGVFeHBhbmQuYmluZCh0aGlzKSlcbiAgICB0aGlzLnN0YXRlID0ge1xuICAgICAgZXhwYW5kZWQ6IHRoaXMuX2lzRXhwYW5kZWQoKSxcbiAgICAgIGNoaWxkcmVuOiBFeHBlY3QucGVuZGluZygpLFxuICAgICAgaXNFZGl0aW5nOiBmYWxzZSxcbiAgICAgIHBlbmRpbmdWYWx1ZTogbnVsbCxcbiAgICAgIHBlbmRpbmdTYXZlOiBmYWxzZSxcbiAgICB9XG4gIH1cblxuICBjb21wb25lbnREaWRNb3VudCgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5zdGF0ZS5leHBhbmRlZCkge1xuICAgICAgdGhpcy5fZmV0Y2hDaGlsZHJlbigpXG4gICAgfVxuICB9XG5cbiAgY29tcG9uZW50V2lsbFVubW91bnQoKTogdm9pZCB7XG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBfaXNFeHBhbmRhYmxlID0gKCk6IGJvb2xlYW4gPT4ge1xuICAgIGlmICh0aGlzLnByb3BzLnBlbmRpbmcpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5wcm9wcy5leHByZXNzaW9uLmhhc0NoaWxkcmVuKClcbiAgfVxuXG4gIF9pc0V4cGFuZGVkID0gKCk6IGJvb2xlYW4gPT4ge1xuICAgIGlmICghdGhpcy5faXNFeHBhbmRhYmxlKCkpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cbiAgICBjb25zdCB7IGV4cGFuc2lvbkNhY2hlLCBub2RlUGF0aCB9ID0gdGhpcy5wcm9wc1xuICAgIHJldHVybiBCb29sZWFuKGV4cGFuc2lvbkNhY2hlLmdldChub2RlUGF0aCkpXG4gIH1cblxuICBfc2V0RXhwYW5kZWQgPSAoZXhwYW5kZWQ6IGJvb2xlYW4pID0+IHtcbiAgICBjb25zdCB7IGV4cGFuc2lvbkNhY2hlLCBub2RlUGF0aCB9ID0gdGhpcy5wcm9wc1xuICAgIGV4cGFuc2lvbkNhY2hlLnNldChub2RlUGF0aCwgZXhwYW5kZWQpXG5cbiAgICBpZiAoZXhwYW5kZWQpIHtcbiAgICAgIHRoaXMuX2ZldGNoQ2hpbGRyZW4oKVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9zdG9wRmV0Y2hpbmdDaGlsZHJlbigpXG4gICAgfVxuXG4gICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICBleHBhbmRlZCxcbiAgICB9KVxuICB9XG5cbiAgX3N0b3BGZXRjaGluZ0NoaWxkcmVuID0gKCk6IHZvaWQgPT4ge1xuICAgIGlmICh0aGlzLl9zdWJzY3JpcHRpb24gIT0gbnVsbCkge1xuICAgICAgdGhpcy5fc3Vic2NyaXB0aW9uLnVuc3Vic2NyaWJlKClcbiAgICAgIHRoaXMuX3N1YnNjcmlwdGlvbiA9IG51bGxcbiAgICB9XG4gIH1cblxuICBfZmV0Y2hDaGlsZHJlbiA9ICgpOiB2b2lkID0+IHtcbiAgICB0aGlzLl9zdG9wRmV0Y2hpbmdDaGlsZHJlbigpXG5cbiAgICBpZiAodGhpcy5faXNFeHBhbmRhYmxlKCkpIHtcbiAgICAgIHRoaXMuX3N1YnNjcmlwdGlvbiA9IE9ic2VydmFibGUuZnJvbVByb21pc2UodGhpcy5wcm9wcy5leHByZXNzaW9uLmdldENoaWxkcmVuKCkpXG4gICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IE9ic2VydmFibGUub2YoW10pKVxuICAgICAgICAubWFwKChjaGlsZHJlbikgPT4gRXhwZWN0LnZhbHVlKCgoY2hpbGRyZW46IGFueSk6IElFeHByZXNzaW9uW10pKSlcbiAgICAgICAgLnN0YXJ0V2l0aChFeHBlY3QucGVuZGluZygpKVxuICAgICAgICAuc3Vic2NyaWJlKChjaGlsZHJlbikgPT4ge1xuICAgICAgICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgICAgICAgY2hpbGRyZW4sXG4gICAgICAgICAgfSlcbiAgICAgICAgfSlcbiAgICB9XG4gIH1cblxuICBfdG9nZ2xlRXhwYW5kID0gKGV2ZW50OiBTeW50aGV0aWNNb3VzZUV2ZW50PD4pOiB2b2lkID0+IHtcbiAgICB0aGlzLl9zZXRFeHBhbmRlZCghdGhpcy5zdGF0ZS5leHBhbmRlZClcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKVxuICB9XG5cbiAgX3JlbmRlclZhbHVlTGluZSA9IChcbiAgICBleHByZXNzaW9uOiBSZWFjdC5FbGVtZW50PGFueT4gfCA/c3RyaW5nLFxuICAgIHZhbHVlOiBSZWFjdC5FbGVtZW50PGFueT4gfCBzdHJpbmdcbiAgKTogUmVhY3QuRWxlbWVudDxhbnk+ID0+IHtcbiAgICBpZiAoZXhwcmVzc2lvbiA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gPGRpdiBjbGFzc05hbWU9XCJudWNsaWRlLXVpLWV4cHJlc3Npb24tdHJlZS12YWx1ZS1jb250YWluZXIgbmF0aXZlLWtleS1iaW5kaW5nc1wiPnt2YWx1ZX08L2Rpdj5cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMucHJvcHMuaGlkZUV4cHJlc3Npb25OYW1lID8gKFxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm51Y2xpZGUtdWktbGF6eS1uZXN0ZWQtdmFsdWUtY29udGFpbmVyIG5hdGl2ZS1rZXktYmluZGluZ3NcIj57dmFsdWV9PC9kaXY+XG4gICAgICApIDogKFxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm51Y2xpZGUtdWktbGF6eS1uZXN0ZWQtdmFsdWUtY29udGFpbmVyIG5hdGl2ZS1rZXktYmluZGluZ3NcIj5cbiAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9e1ZhbHVlQ29tcG9uZW50Q2xhc3NOYW1lcy5pZGVudGlmaWVyfT57ZXhwcmVzc2lvbn08L3NwYW4+OiB7dmFsdWV9XG4gICAgICAgIDwvZGl2PlxuICAgICAgKVxuICAgIH1cbiAgfVxuXG4gIF9yZW5kZXJDaGlsZCA9IChjaGlsZDogSUV4cHJlc3Npb24pOiBSZWFjdC5Ob2RlID0+IHtcbiAgICBjb25zdCBub2RlUGF0aCA9IHRoaXMucHJvcHMubm9kZVBhdGggKyBcIi9cIiArIGNoaWxkLm5hbWVcbiAgICByZXR1cm4gKFxuICAgICAgPFRyZWVJdGVtIGtleT17bm9kZVBhdGh9PlxuICAgICAgICA8RXhwcmVzc2lvblRyZWVOb2RlIGV4cHJlc3Npb249e2NoaWxkfSBleHBhbnNpb25DYWNoZT17dGhpcy5wcm9wcy5leHBhbnNpb25DYWNoZX0gbm9kZVBhdGg9e25vZGVQYXRofSAvPlxuICAgICAgPC9UcmVlSXRlbT5cbiAgICApXG4gIH1cblxuICBfZ2V0VmFyaWFibGVFeHByZXNzaW9uKCk6ID9JVmFyaWFibGUge1xuICAgIGNvbnN0IHsgZXhwcmVzc2lvbiB9ID0gdGhpcy5wcm9wc1xuICAgIHJldHVybiAoZXhwcmVzc2lvbjogYW55KS5jYW5TZXRWYXJpYWJsZSA9PSBudWxsIHx8IChleHByZXNzaW9uOiBhbnkpLnNldFZhcmlhYmxlID09IG51bGwgPyBudWxsIDogKGV4cHJlc3Npb246IGFueSlcbiAgfVxuXG4gIF9pc0VkaXRhYmxlID0gKCk6IGJvb2xlYW4gPT4ge1xuICAgIGNvbnN0IHZhcmlhYmxlID0gdGhpcy5fZ2V0VmFyaWFibGVFeHByZXNzaW9uKClcbiAgICByZXR1cm4gdmFyaWFibGUgIT0gbnVsbCAmJiB2YXJpYWJsZS5jYW5TZXRWYXJpYWJsZSgpICYmICF0aGlzLnByb3BzLnJlYWRPbmx5XG4gIH1cblxuICBfdXBkYXRlVmFsdWUgPSAoKTogdm9pZCA9PiB7XG4gICAgY29uc3QgeyBwZW5kaW5nVmFsdWUgfSA9IHRoaXMuc3RhdGVcbiAgICBjb25zdCB2YXJpYWJsZSA9IG51bGx0aHJvd3ModGhpcy5fZ2V0VmFyaWFibGVFeHByZXNzaW9uKCkpXG5cbiAgICBjb25zdCBkb0VkaXQgPSBwZW5kaW5nVmFsdWUgIT0gbnVsbFxuICAgIHRoaXMuX2NhbmNlbEVkaXQoZG9FZGl0KVxuXG4gICAgaWYgKGRvRWRpdCkge1xuICAgICAgaW52YXJpYW50KHBlbmRpbmdWYWx1ZSAhPSBudWxsKVxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gT2JzZXJ2YWJsZS5mcm9tUHJvbWlzZSh2YXJpYWJsZS5zZXRWYXJpYWJsZShwZW5kaW5nVmFsdWUpKVxuICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgaWYgKGVycm9yICE9IG51bGwgJiYgZXJyb3IubWVzc2FnZSAhPSBudWxsKSB7XG4gICAgICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoYEZhaWxlZCB0byBzZXQgdmFyaWFibGUgdmFsdWU6ICR7U3RyaW5nKGVycm9yLm1lc3NhZ2UpfWApXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKG51bGwpXG4gICAgICAgIH0pXG4gICAgICAgIC5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgICAgIHRoaXMuX2Rpc3Bvc2FibGVzLnJlbW92ZShzdWJzY3JpcHRpb24pXG4gICAgICAgICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICAgICAgICBwZW5kaW5nU2F2ZTogZmFsc2UsXG4gICAgICAgICAgfSlcbiAgICAgICAgfSlcblxuICAgICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKHN1YnNjcmlwdGlvbilcbiAgICB9XG4gIH1cblxuICBfY2FuY2VsRWRpdCA9IChwZW5kaW5nU2F2ZTogP2Jvb2xlYW4gPSBmYWxzZSk6IHZvaWQgPT4ge1xuICAgIGNvbnN0IG5ld1N0YXRlOiBPYmplY3QgPSB7XG4gICAgICBpc0VkaXRpbmc6IGZhbHNlLFxuICAgICAgcGVuZGluZ1ZhbHVlOiBudWxsLFxuICAgIH1cbiAgICBpZiAocGVuZGluZ1NhdmUgIT0gbnVsbCkge1xuICAgICAgbmV3U3RhdGUucGVuZGluZ1NhdmUgPSBwZW5kaW5nU2F2ZVxuICAgIH1cbiAgICB0aGlzLnNldFN0YXRlKG5ld1N0YXRlKVxuICB9XG5cbiAgX3N0YXJ0RWRpdCA9ICgpOiB2b2lkID0+IHtcbiAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgIGlzRWRpdGluZzogdHJ1ZSxcbiAgICAgIHBlbmRpbmdWYWx1ZTogbnVsbCxcbiAgICAgIHBlbmRpbmdTYXZlOiBmYWxzZSxcbiAgICB9KVxuICB9XG5cbiAgX2dldFZhbHVlQXNTdHJpbmcgPSAoZXhwcmVzc2lvbjogSUV4cHJlc3Npb24pOiBzdHJpbmcgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gZXhwcmVzc2lvbi5nZXRWYWx1ZSgpXG4gICAgaWYgKHZhbHVlICE9IG51bGwgJiYgZXhwcmVzc2lvbi50eXBlID09PSBcInN0cmluZ1wiKSB7XG4gICAgICByZXR1cm4gU1RSSU5HX1JFR0VYLnRlc3QodmFsdWUpID8gdmFsdWUgOiBgXCIke3ZhbHVlfVwiYFxuICAgIH1cbiAgICByZXR1cm4gdmFsdWUgfHwgXCJcIlxuICB9XG5cbiAgX3NldEVkaXRvckdyYW1tYXIgPSAoZWRpdG9yOiA/QXRvbUlucHV0KTogdm9pZCA9PiB7XG4gICAgaWYgKGVkaXRvciA9PSBudWxsKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCB2YXJpYWJsZSA9IHRoaXMuX2dldFZhcmlhYmxlRXhwcmVzc2lvbigpXG4gICAgaWYgKHZhcmlhYmxlID09IG51bGwpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmICh2YXJpYWJsZS5ncmFtbWFyTmFtZSAhPSBudWxsICYmIHZhcmlhYmxlLmdyYW1tYXJOYW1lICE9PSBcIlwiKSB7XG4gICAgICBjb25zdCBncmFtbWFyID0gYXRvbS5ncmFtbWFycy5ncmFtbWFyRm9yU2NvcGVOYW1lKHZhcmlhYmxlLmdyYW1tYXJOYW1lKVxuICAgICAgaWYgKGdyYW1tYXIgPT0gbnVsbCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGVkaXRvci5nZXRUZXh0RWRpdG9yKCkuc2V0R3JhbW1hcihncmFtbWFyKVxuICAgIH1cbiAgfVxuXG4gIF9yZW5kZXJFZGl0VmlldyA9IChleHByZXNzaW9uOiBJRXhwcmVzc2lvbik6IFJlYWN0LkVsZW1lbnQ8YW55PiA9PiB7XG4gICAgcmV0dXJuIChcbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZXhwcmVzc2lvbi10cmVlLWxpbmUtY29udHJvbFwiPlxuICAgICAgICA8QXRvbUlucHV0XG4gICAgICAgICAgY2xhc3NOYW1lPVwiZXhwcmVzc2lvbi10cmVlLXZhbHVlLWJveCBpbmxpbmUtYmxvY2tcIlxuICAgICAgICAgIHNpemU9XCJzbVwiXG4gICAgICAgICAgYXV0b2ZvY3VzPXt0cnVlfVxuICAgICAgICAgIHN0YXJ0U2VsZWN0ZWQ9e2ZhbHNlfVxuICAgICAgICAgIGluaXRpYWxWYWx1ZT17dGhpcy5fZ2V0VmFsdWVBc1N0cmluZyhleHByZXNzaW9uKX1cbiAgICAgICAgICBvbkRpZENoYW5nZT17KHBlbmRpbmdWYWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5zZXRTdGF0ZSh7IHBlbmRpbmdWYWx1ZTogcGVuZGluZ1ZhbHVlLnRyaW0oKSB9KVxuICAgICAgICAgIH19XG4gICAgICAgICAgb25Db25maXJtPXt0aGlzLl91cGRhdGVWYWx1ZX1cbiAgICAgICAgICBvbkNhbmNlbD17KCkgPT4gdGhpcy5fY2FuY2VsRWRpdCgpfVxuICAgICAgICAgIG9uQmx1cj17KCkgPT4gdGhpcy5fY2FuY2VsRWRpdCgpfVxuICAgICAgICAgIHJlZj17dGhpcy5fc2V0RWRpdG9yR3JhbW1hcn1cbiAgICAgICAgLz5cbiAgICAgICAgPEljb25cbiAgICAgICAgICBpY29uPVwiY2hlY2tcIlxuICAgICAgICAgIHRpdGxlPVwiU2F2ZSBjaGFuZ2VzXCJcbiAgICAgICAgICBjbGFzc05hbWU9XCJleHByZXNzaW9uLXRyZWUtZWRpdC1idXR0b24tY29uZmlybVwiXG4gICAgICAgICAgb25DbGljaz17dGhpcy5fdXBkYXRlVmFsdWV9XG4gICAgICAgIC8+XG4gICAgICAgIDxJY29uXG4gICAgICAgICAgaWNvbj1cInhcIlxuICAgICAgICAgIHRpdGxlPVwiQ2FuY2VsIGNoYW5nZXNcIlxuICAgICAgICAgIGNsYXNzTmFtZT1cImV4cHJlc3Npb24tdHJlZS1lZGl0LWJ1dHRvbi1jYW5jZWxcIlxuICAgICAgICAgIG9uQ2xpY2s9e3RoaXMuX2NhbmNlbEVkaXR9XG4gICAgICAgIC8+XG4gICAgICA8L2Rpdj5cbiAgICApXG4gIH1cblxuICBfcmVuZGVyRWRpdEhvdmVyQ29udHJvbHMoKTogP1JlYWN0LkVsZW1lbnQ8YW55PiB7XG4gICAgaWYgKCF0aGlzLl9pc0VkaXRhYmxlKCkgfHwgdGhpcy5zdGF0ZS5pc0VkaXRpbmcpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICAgIHJldHVybiAoXG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXNjb3Blcy12aWV3LWNvbnRyb2xzXCI+XG4gICAgICAgIDxJY29uXG4gICAgICAgICAgaWNvbj1cInBlbmNpbFwiXG4gICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItc2NvcGVzLXZpZXctZWRpdC1jb250cm9sXCJcbiAgICAgICAgICBvbkNsaWNrPXsoXykgPT4ge1xuICAgICAgICAgICAgdHJhY2soRURJVF9WQUxVRV9GUk9NX0lDT04pXG4gICAgICAgICAgICB0aGlzLl9zdGFydEVkaXQoKVxuICAgICAgICAgIH19XG4gICAgICAgIC8+XG4gICAgICA8L2Rpdj5cbiAgICApXG4gIH1cblxuICByZW5kZXIoKTogUmVhY3QuTm9kZSB7XG4gICAgY29uc3QgeyBwZW5kaW5nLCBleHByZXNzaW9uIH0gPSB0aGlzLnByb3BzXG4gICAgY29uc3QgeyBwZW5kaW5nU2F2ZSB9ID0gdGhpcy5zdGF0ZVxuICAgIGlmIChwZW5kaW5nIHx8IHBlbmRpbmdTYXZlKSB7XG4gICAgICAvLyBWYWx1ZSBub3QgYXZhaWxhYmxlIHlldC4gU2hvdyBhIGRlbGF5ZWQgbG9hZGluZyBzcGlubmVyLlxuICAgICAgcmV0dXJuIChcbiAgICAgICAgPFRyZWVJdGVtIGNsYXNzTmFtZT1cIm51Y2xpZGUtdWktZXhwcmVzc2lvbi10cmVlLXZhbHVlLXNwaW5uZXJcIj5cbiAgICAgICAgICA8TG9hZGluZ1NwaW5uZXIgc2l6ZT1cIkVYVFJBX1NNQUxMXCIgZGVsYXk9e1NQSU5ORVJfREVMQVl9IC8+XG4gICAgICAgIDwvVHJlZUl0ZW0+XG4gICAgICApXG4gICAgfVxuXG4gICAgY29uc3QgaXNFZGl0YWJsZSA9IHRoaXMuX2lzRWRpdGFibGUoKVxuICAgIGlmICghdGhpcy5faXNFeHBhbmRhYmxlKCkpIHtcbiAgICAgIC8vIFRoaXMgaXMgYSBzaW1wbGUgdmFsdWUgd2l0aCBubyBjaGlsZHJlbi5cbiAgICAgIHJldHVybiAoXG4gICAgICAgIDxkaXZcbiAgICAgICAgICBvbkRvdWJsZUNsaWNrPXtpc0VkaXRhYmxlICYmICF0aGlzLnN0YXRlLmlzRWRpdGluZyA/IHRoaXMuX3N0YXJ0RWRpdCA6ICgpID0+IHt9fVxuICAgICAgICAgIGNsYXNzTmFtZT1cImV4cHJlc3Npb24tdHJlZS1saW5lLWNvbnRyb2xcIlxuICAgICAgICA+XG4gICAgICAgICAge3RoaXMuc3RhdGUuaXNFZGl0aW5nID8gKFxuICAgICAgICAgICAgdGhpcy5fcmVuZGVyRWRpdFZpZXcoZXhwcmVzc2lvbilcbiAgICAgICAgICApIDogKFxuICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwibmF0aXZlLWtleS1iaW5kaW5ncyBleHByZXNzaW9uLXRyZWUtdmFsdWUtYm94XCI+XG4gICAgICAgICAgICAgIDxTaW1wbGVWYWx1ZUNvbXBvbmVudCBleHByZXNzaW9uPXtleHByZXNzaW9ufSAvPlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICl9XG4gICAgICAgICAge2lzRWRpdGFibGUgPyB0aGlzLl9yZW5kZXJFZGl0SG92ZXJDb250cm9scygpIDogbnVsbH1cbiAgICAgICAgPC9kaXY+XG4gICAgICApXG4gICAgfVxuXG4gICAgLy8gQSBub2RlIHdpdGggYSBkZWxheWVkIHNwaW5uZXIgdG8gZGlzcGxheSBpZiB3ZSdyZSBleHBhbmRlZCwgYnV0IHdhaXRpbmcgZm9yXG4gICAgLy8gY2hpbGRyZW4gdG8gYmUgZmV0Y2hlZC5cbiAgICBjb25zdCBwZW5kaW5nQ2hpbGRyZW5Ob2RlID0gKFxuICAgICAgPEV4cHJlc3Npb25UcmVlTm9kZVxuICAgICAgICBleHByZXNzaW9uPXt0aGlzLnByb3BzLmV4cHJlc3Npb259XG4gICAgICAgIHBlbmRpbmc9e3RydWV9XG4gICAgICAgIGV4cGFuc2lvbkNhY2hlPXt0aGlzLnByb3BzLmV4cGFuc2lvbkNhY2hlfVxuICAgICAgICBub2RlUGF0aD17dGhpcy5wcm9wcy5ub2RlUGF0aH1cbiAgICAgIC8+XG4gICAgKVxuXG4gICAgLy8gSWYgY29sbGFwc2VkLCByZW5kZXIgbm8gY2hpbGRyZW4uIE90aGVyd2lzZSBlaXRoZXIgcmVuZGVyIHRoZSBwZW5kaW5nQ2hpbGRyZW5Ob2RlXG4gICAgLy8gaWYgdGhlIGZldGNoIGhhc24ndCBjb21wbGV0ZWQsIG9yIHRoZSBjaGlsZHJlbiBpZiB3ZSd2ZSBnb3QgdGhlbS5cbiAgICBsZXQgY2hpbGRyZW5cbiAgICBpZiAoIXRoaXMuc3RhdGUuZXhwYW5kZWQpIHtcbiAgICAgIGNoaWxkcmVuID0gbnVsbFxuICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZS5jaGlsZHJlbi5pc1BlbmRpbmcpIHtcbiAgICAgIGNoaWxkcmVuID0gcGVuZGluZ0NoaWxkcmVuTm9kZVxuICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZS5jaGlsZHJlbi5pc0Vycm9yKSB7XG4gICAgICBjaGlsZHJlbiA9IHRoaXMuX3JlbmRlclZhbHVlTGluZShcbiAgICAgICAgXCJDaGlsZHJlblwiLFxuICAgICAgICB0aGlzLnN0YXRlLmNoaWxkcmVuLmVycm9yICE9IG51bGwgPyB0aGlzLnN0YXRlLmNoaWxkcmVuLmVycm9yLnRvU3RyaW5nKCkgOiBOT1RfQVZBSUxBQkxFX01FU1NBR0VcbiAgICAgIClcbiAgICB9IGVsc2Uge1xuICAgICAgY2hpbGRyZW4gPSB0aGlzLnN0YXRlLmNoaWxkcmVuLnZhbHVlLm1hcCgoY2hpbGQpID0+IHRoaXMuX3JlbmRlckNoaWxkKGNoaWxkKSlcbiAgICB9XG5cbiAgICByZXR1cm4gKFxuICAgICAgPFRyZWVMaXN0IHNob3dBcnJvd3M9e3RydWV9IGNsYXNzTmFtZT1cIm51Y2xpZGUtdWktZXhwcmVzc2lvbi10cmVlLXZhbHVlLXRyZWVsaXN0XCI+XG4gICAgICAgIDxOZXN0ZWRUcmVlSXRlbVxuICAgICAgICAgIGNvbGxhcHNlZD17IXRoaXMuc3RhdGUuZXhwYW5kZWR9XG4gICAgICAgICAgb25Db25maXJtPXtpc0VkaXRhYmxlID8gdGhpcy5fc3RhcnRFZGl0IDogKCkgPT4ge319XG4gICAgICAgICAgb25TZWxlY3Q9e3RoaXMuc3RhdGUuaXNFZGl0aW5nID8gKCkgPT4ge30gOiB0aGlzLl90b2dnbGVOb2RlRXhwYW5kZWR9XG4gICAgICAgICAgdGl0bGU9e1xuICAgICAgICAgICAgdGhpcy5zdGF0ZS5pc0VkaXRpbmdcbiAgICAgICAgICAgICAgPyB0aGlzLl9yZW5kZXJFZGl0VmlldyhleHByZXNzaW9uKVxuICAgICAgICAgICAgICA6IHRoaXMuX3JlbmRlclZhbHVlTGluZShleHByZXNzaW9uLm5hbWUsIGV4cHJlc3Npb24uZ2V0VmFsdWUoKSlcbiAgICAgICAgICB9XG4gICAgICAgID5cbiAgICAgICAgICB7Y2hpbGRyZW59XG4gICAgICAgIDwvTmVzdGVkVHJlZUl0ZW0+XG4gICAgICA8L1RyZWVMaXN0PlxuICAgIClcbiAgfVxufVxuXG5leHBvcnQgdHlwZSBFeHByZXNzaW9uVHJlZUNvbXBvbmVudFByb3BzID0ge1xuICBleHByZXNzaW9uOiBJRXhwcmVzc2lvbixcbiAgY29udGFpbmVyQ29udGV4dDogT2JqZWN0LFxuICBwZW5kaW5nPzogYm9vbGVhbixcbiAgY2xhc3NOYW1lPzogc3RyaW5nLFxuICBoaWRlRXhwcmVzc2lvbk5hbWU/OiBib29sZWFuLFxuICByZWFkT25seT86IGJvb2xlYW4sXG59XG5cbmV4cG9ydCBjbGFzcyBFeHByZXNzaW9uVHJlZUNvbXBvbmVudCBleHRlbmRzIFJlYWN0LkNvbXBvbmVudDxFeHByZXNzaW9uVHJlZUNvbXBvbmVudFByb3BzPiB7XG4gIGNvbnN0cnVjdG9yKHByb3BzOiBFeHByZXNzaW9uVHJlZUNvbXBvbmVudFByb3BzKSB7XG4gICAgc3VwZXIocHJvcHMpXG4gIH1cblxuICBfZ2V0RXhwYW5zaW9uQ2FjaGUgPSAoKTogTWFwPHN0cmluZywgYm9vbGVhbj4gPT4ge1xuICAgIGxldCBjYWNoZSA9IEV4cGFuc2lvblN0YXRlcy5nZXQodGhpcy5wcm9wcy5jb250YWluZXJDb250ZXh0KVxuICAgIGlmIChjYWNoZSA9PSBudWxsKSB7XG4gICAgICBjYWNoZSA9IG5ldyBNYXAoKVxuICAgICAgRXhwYW5zaW9uU3RhdGVzLnNldCh0aGlzLnByb3BzLmNvbnRhaW5lckNvbnRleHQsIGNhY2hlKVxuICAgIH1cbiAgICByZXR1cm4gY2FjaGVcbiAgfVxuXG4gIHJlbmRlcigpOiBSZWFjdC5Ob2RlIHtcbiAgICBjb25zdCBjbGFzc05hbWUgPSBjbGFzc25hbWVzKHRoaXMucHJvcHMuY2xhc3NOYW1lLCB7XG4gICAgICBcIm51Y2xpZGUtdWktZXhwcmVzc2lvbi10cmVlLXZhbHVlXCI6IHRoaXMucHJvcHMuY2xhc3NOYW1lID09IG51bGwsXG4gICAgfSlcbiAgICByZXR1cm4gKFxuICAgICAgPHNwYW4gY2xhc3NOYW1lPXtjbGFzc05hbWV9IHRhYkluZGV4PXstMX0+XG4gICAgICAgIDxFeHByZXNzaW9uVHJlZU5vZGVcbiAgICAgICAgICBleHByZXNzaW9uPXt0aGlzLnByb3BzLmV4cHJlc3Npb259XG4gICAgICAgICAgcGVuZGluZz17dGhpcy5wcm9wcy5wZW5kaW5nfVxuICAgICAgICAgIG5vZGVQYXRoPVwicm9vdFwiXG4gICAgICAgICAgZXhwYW5zaW9uQ2FjaGU9e3RoaXMuX2dldEV4cGFuc2lvbkNhY2hlKCl9XG4gICAgICAgICAgaGlkZUV4cHJlc3Npb25OYW1lPXt0aGlzLnByb3BzLmhpZGVFeHByZXNzaW9uTmFtZX1cbiAgICAgICAgICByZWFkT25seT17dGhpcy5wcm9wcy5yZWFkT25seX1cbiAgICAgICAgLz5cbiAgICAgIDwvc3Bhbj5cbiAgICApXG4gIH1cbn1cbiJdfQ==