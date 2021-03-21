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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkV4cHJlc3Npb25UcmVlQ29tcG9uZW50LmpzIl0sIm5hbWVzIjpbIkVESVRfVkFMVUVfRlJPTV9JQ09OIiwiTk9UX0FWQUlMQUJMRV9NRVNTQUdFIiwiU1BJTk5FUl9ERUxBWSIsIkV4cGFuc2lvblN0YXRlcyIsIldlYWtNYXAiLCJFeHByZXNzaW9uVHJlZU5vZGUiLCJSZWFjdCIsIkNvbXBvbmVudCIsImNvbnN0cnVjdG9yIiwicHJvcHMiLCJzdGF0ZSIsIl90b2dnbGVOb2RlRXhwYW5kZWQiLCJfZGlzcG9zYWJsZXMiLCJfc3Vic2NyaXB0aW9uIiwiX2lzRXhwYW5kYWJsZSIsInBlbmRpbmciLCJleHByZXNzaW9uIiwiaGFzQ2hpbGRyZW4iLCJfaXNFeHBhbmRlZCIsImV4cGFuc2lvbkNhY2hlIiwibm9kZVBhdGgiLCJCb29sZWFuIiwiZ2V0IiwiX3NldEV4cGFuZGVkIiwiZXhwYW5kZWQiLCJzZXQiLCJfZmV0Y2hDaGlsZHJlbiIsIl9zdG9wRmV0Y2hpbmdDaGlsZHJlbiIsInNldFN0YXRlIiwidW5zdWJzY3JpYmUiLCJPYnNlcnZhYmxlIiwiZnJvbVByb21pc2UiLCJnZXRDaGlsZHJlbiIsImNhdGNoIiwiZXJyb3IiLCJvZiIsIm1hcCIsImNoaWxkcmVuIiwiRXhwZWN0IiwidmFsdWUiLCJzdGFydFdpdGgiLCJzdWJzY3JpYmUiLCJfdG9nZ2xlRXhwYW5kIiwiZXZlbnQiLCJzdG9wUHJvcGFnYXRpb24iLCJfcmVuZGVyVmFsdWVMaW5lIiwiaGlkZUV4cHJlc3Npb25OYW1lIiwiVmFsdWVDb21wb25lbnRDbGFzc05hbWVzIiwiaWRlbnRpZmllciIsIl9yZW5kZXJDaGlsZCIsImNoaWxkIiwibmFtZSIsIl9pc0VkaXRhYmxlIiwidmFyaWFibGUiLCJfZ2V0VmFyaWFibGVFeHByZXNzaW9uIiwiY2FuU2V0VmFyaWFibGUiLCJyZWFkT25seSIsIl91cGRhdGVWYWx1ZSIsInBlbmRpbmdWYWx1ZSIsImRvRWRpdCIsIl9jYW5jZWxFZGl0Iiwic3Vic2NyaXB0aW9uIiwic2V0VmFyaWFibGUiLCJtZXNzYWdlIiwiYXRvbSIsIm5vdGlmaWNhdGlvbnMiLCJhZGRFcnJvciIsIlN0cmluZyIsInJlbW92ZSIsInBlbmRpbmdTYXZlIiwiYWRkIiwibmV3U3RhdGUiLCJpc0VkaXRpbmciLCJfc3RhcnRFZGl0IiwiX2dldFZhbHVlQXNTdHJpbmciLCJnZXRWYWx1ZSIsInR5cGUiLCJTVFJJTkdfUkVHRVgiLCJ0ZXN0IiwiX3NldEVkaXRvckdyYW1tYXIiLCJlZGl0b3IiLCJncmFtbWFyTmFtZSIsImdyYW1tYXIiLCJncmFtbWFycyIsImdyYW1tYXJGb3JTY29wZU5hbWUiLCJnZXRUZXh0RWRpdG9yIiwic2V0R3JhbW1hciIsIl9yZW5kZXJFZGl0VmlldyIsInRyaW0iLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwiYmluZCIsImNvbXBvbmVudERpZE1vdW50IiwiY29tcG9uZW50V2lsbFVubW91bnQiLCJkaXNwb3NlIiwiX3JlbmRlckVkaXRIb3ZlckNvbnRyb2xzIiwiXyIsInJlbmRlciIsImlzRWRpdGFibGUiLCJwZW5kaW5nQ2hpbGRyZW5Ob2RlIiwiaXNQZW5kaW5nIiwiaXNFcnJvciIsInRvU3RyaW5nIiwiRXhwcmVzc2lvblRyZWVDb21wb25lbnQiLCJfZ2V0RXhwYW5zaW9uQ2FjaGUiLCJjYWNoZSIsImNvbnRhaW5lckNvbnRleHQiLCJNYXAiLCJjbGFzc05hbWUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFHQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFFQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxvQkFBb0IsR0FBRyxzQkFBN0I7QUFDQSxNQUFNQyxxQkFBcUIsR0FBRyxpQkFBOUI7QUFDQSxNQUFNQyxhQUFhLEdBQUcsR0FBdEI7QUFBMEI7QUFFMUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBQ0EsTUFBTUMsZUFBc0QsR0FBRyxJQUFJQyxPQUFKLEVB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LGtCQUFEO0FBQ0UsTUFBQSxVQUFVLEVBQUUsS0FBS2xHLEtBQUwsQ0FBV08sVUFEekI7QUFFRSxNQUFBLE9BQU8sRUFBRSxLQUFLUCxLQUFMLENBQVdNLE9BRnRCO0FBR0UsTUFBQSxRQUFRLEVBQUMsTUFIWDtBQUlFLE1BQUEsY0FBYyxFQUFFLEtBQUt3RixrQkFBTCxFQUpsQjtBQUtFLE1BQUEsa0JBQWtCLEVBQUUsS0FBSzlGLEtBQUwsQ0FBV3FDLGtCQUxqQztBQU1FLE1BQUEsUUFBUSxFQUFFLEtBQUtyQyxLQUFMLENBQVcrQztBQU52QixNQURGLENBREY7QUFZRDs7QUE5QndGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBJRXhwcmVzc2lvbiwgSVZhcmlhYmxlIH0gZnJvbSBcImF0b20taWRlLXVpXCJcbmltcG9ydCB0eXBlIHsgRXhwZWN0ZWQgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXhwZWN0ZWRcIlxuXG5pbXBvcnQgeyBBdG9tSW5wdXQgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvQXRvbUlucHV0XCJcbmltcG9ydCB7IEljb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvSWNvblwiXG5pbXBvcnQgeyB0cmFjayB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9hbmFseXRpY3NcIlxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcbmltcG9ydCBjbGFzc25hbWVzIGZyb20gXCJjbGFzc25hbWVzXCJcbmltcG9ydCB7IEV4cGVjdCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9leHBlY3RlZFwiXG5pbXBvcnQgaWdub3JlVGV4dFNlbGVjdGlvbkV2ZW50cyBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvaWdub3JlVGV4dFNlbGVjdGlvbkV2ZW50c1wiXG5pbXBvcnQgaW52YXJpYW50IGZyb20gXCJhc3NlcnRcIlxuaW1wb3J0IG51bGx0aHJvd3MgZnJvbSBcIm51bGx0aHJvd3NcIlxuaW1wb3J0IHsgTG9hZGluZ1NwaW5uZXIgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvTG9hZGluZ1NwaW5uZXJcIlxuaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gXCJyeGpzLWNvbXBhdC9idW5kbGVzL3J4anMtY29tcGF0LnVtZC5taW4uanNcIlxuaW1wb3J0IFNpbXBsZVZhbHVlQ29tcG9uZW50IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9TaW1wbGVWYWx1ZUNvbXBvbmVudFwiXG5pbXBvcnQgeyBTVFJJTkdfUkVHRVggfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvU2ltcGxlVmFsdWVDb21wb25lbnRcIlxuaW1wb3J0IHsgVHJlZUxpc3QsIFRyZWVJdGVtLCBOZXN0ZWRUcmVlSXRlbSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9UcmVlXCJcbmltcG9ydCBVbml2ZXJzYWxEaXNwb3NhYmxlIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9Vbml2ZXJzYWxEaXNwb3NhYmxlXCJcbmltcG9ydCB7IFZhbHVlQ29tcG9uZW50Q2xhc3NOYW1lcyB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9WYWx1ZUNvbXBvbmVudENsYXNzTmFtZXNcIlxuXG5jb25zdCBFRElUX1ZBTFVFX0ZST01fSUNPTiA9IFwiZWRpdC12YWx1ZS1mcm9tLWljb25cIlxuY29uc3QgTk9UX0FWQUlMQUJMRV9NRVNTQUdFID0gXCI8bm90IGF2YWlsYWJsZT5cIlxuY29uc3QgU1BJTk5FUl9ERUxBWSA9IDIwMCAvKiBtcyAqL1xuXG4vLyBUaGlzIHdlYWsgbWFwIHRyYWNrcyB3aGljaCBub2RlIHBhdGgocykgYXJlIGV4cGFuZGVkIGluIGEgcmVjdXJzaXZlIGV4cHJlc3Npb25cbi8vIHZhbHVlIHRyZWUuIFRoZXNlIG11c3QgYmUgdHJhY2tlZCBvdXRzaWRlIG9mIHRoZSBSZWFjdCBvYmplY3RzIHRoZW1zZWx2ZXMsIGJlY2F1c2Vcbi8vIGV4cGFuc2lvbiBzdGF0ZSBpcyBwZXJzaXN0ZWQgZXZlbiBpZiB0aGUgdHJlZSBpcyBkZXN0cm95ZWQgYW5kIHJlY3JlYXRlZCAoc3VjaCBhcyB3aGVuXG4vLyBzdGVwcGluZyBpbiBhIGRlYnVnZ2VyKS4gVGhlIHJvb3Qgb2YgZWFjaCB0cmVlIGhhcyBhIGNvbnRleHQsIHdoaWNoIGlzIGJhc2VkIG9uIHRoZVxuLy8gY29tcG9uZW50IHRoYXQgY29udGFpbnMgdGhlIHRyZWUgKHN1Y2ggYXMgYSBkZWJ1Z2dlciBwYW5lLCB0b29sdGlwIG9yIGNvbnNvbGUgcGFuZSkuXG4vLyBXaGVuIHRoYXQgY29tcG9uZW50IGlzIGRlc3Ryb3llZCwgdGhlIFdlYWtNYXAgd2lsbCByZW1vdmUgdGhlIGV4cGFuc2lvbiBzdGF0ZSBpbmZvcm1hdGlvblxuLy8gZm9yIHRoZSBlbnRpcmUgdHJlZS5cbmNvbnN0IEV4cGFuc2lvblN0YXRlczogV2Vha01hcDxPYmplY3QsIE1hcDxzdHJpbmcsIGJvb2xlYW4+PiA9IG5ldyBXZWFrTWFwKClcblxudHlwZSBFeHByZXNzaW9uVHJlZU5vZGVQcm9wcyA9IHtcbiAgZXhwcmVzc2lvbjogSUV4cHJlc3Npb24sXG4gIHBlbmRpbmc/OiBib29sZWFuLFxuICBleHBhbnNpb25DYWNoZTogTWFwPHN0cmluZywgYm9vbGVhbj4sXG4gIG5vZGVQYXRoOiBzdHJpbmcsXG4gIGhpZGVFeHByZXNzaW9uTmFtZT86IGJvb2xlYW4sXG4gIHJlYWRPbmx5PzogYm9vbGVhbixcbn1cblxudHlwZSBFeHByZXNzaW9uVHJlZU5vZGVTdGF0ZSA9IHtcbiAgZXhwYW5kZWQ6IGJvb2xlYW4sXG4gIGNoaWxkcmVuOiBFeHBlY3RlZDxJRXhwcmVzc2lvbltdPixcbiAgaXNFZGl0aW5nOiBib29sZWFuLFxuICBwZW5kaW5nVmFsdWU6ID9zdHJpbmcsXG4gIHBlbmRpbmdTYXZlOiBib29sZWFuLFxufVxuXG5leHBvcnQgY2xhc3MgRXhwcmVzc2lvblRyZWVOb2RlIGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50PEV4cHJlc3Npb25UcmVlTm9kZVByb3BzLCBFeHByZXNzaW9uVHJlZU5vZGVTdGF0ZT4ge1xuICBzdGF0ZTogRXhwcmVzc2lvblRyZWVOb2RlU3RhdGVcbiAgX3RvZ2dsZU5vZGVFeHBhbmRlZDogKGU6IFN5bnRoZXRpY01vdXNlRXZlbnQ8PikgPT4gdm9pZFxuICBfZGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcbiAgX3N1YnNjcmlwdGlvbjogP3J4anMkSVN1YnNjcmlwdGlvblxuXG4gIGNvbnN0cnVjdG9yKHByb3BzOiBFeHByZXNzaW9uVHJlZU5vZGVQcm9wcykge1xuICAgIHN1cGVyKHByb3BzKVxuICAgIHRoaXMuX3N1YnNjcmlwdGlvbiA9IG51bGxcbiAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuX3N1YnNjcmlwdGlvbiAhPSBudWxsKSB7XG4gICAgICAgIHRoaXMuX3N1YnNjcmlwdGlvbi51bnN1YnNjcmliZSgpXG4gICAgICB9XG4gICAgfSlcbiAgICB0aGlzLl90b2dnbGVOb2RlRXhwYW5kZWQgPSBpZ25vcmVUZXh0U2VsZWN0aW9uRXZlbnRzKHRoaXMuX3RvZ2dsZUV4cGFuZC5iaW5kKHRoaXMpKVxuICAgIHRoaXMuc3RhdGUgPSB7XG4gICAgICBleHBhbmRlZDogdGhpcy5faXNFeHBhbmRlZCgpLFxuICAgICAgY2hpbGRyZW46IEV4cGVjdC5wZW5kaW5nKCksXG4gICAgICBpc0VkaXRpbmc6IGZhbHNlLFxuICAgICAgcGVuZGluZ1ZhbHVlOiBudWxsLFxuICAgICAgcGVuZGluZ1NhdmU6IGZhbHNlLFxuICAgIH1cbiAgfVxuXG4gIGNvbXBvbmVudERpZE1vdW50KCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnN0YXRlLmV4cGFuZGVkKSB7XG4gICAgICB0aGlzLl9mZXRjaENoaWxkcmVuKClcbiAgICB9XG4gIH1cblxuICBjb21wb25lbnRXaWxsVW5tb3VudCgpOiB2b2lkIHtcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIF9pc0V4cGFuZGFibGUgPSAoKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKHRoaXMucHJvcHMucGVuZGluZykge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuICAgIHJldHVybiB0aGlzLnByb3BzLmV4cHJlc3Npb24uaGFzQ2hpbGRyZW4oKVxuICB9XG5cbiAgX2lzRXhwYW5kZWQgPSAoKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCF0aGlzLl9pc0V4cGFuZGFibGUoKSkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuICAgIGNvbnN0IHsgZXhwYW5zaW9uQ2FjaGUsIG5vZGVQYXRoIH0gPSB0aGlzLnByb3BzXG4gICAgcmV0dXJuIEJvb2xlYW4oZXhwYW5zaW9uQ2FjaGUuZ2V0KG5vZGVQYXRoKSlcbiAgfVxuXG4gIF9zZXRFeHBhbmRlZCA9IChleHBhbmRlZDogYm9vbGVhbikgPT4ge1xuICAgIGNvbnN0IHsgZXhwYW5zaW9uQ2FjaGUsIG5vZGVQYXRoIH0gPSB0aGlzLnByb3BzXG4gICAgZXhwYW5zaW9uQ2FjaGUuc2V0KG5vZGVQYXRoLCBleHBhbmRlZClcblxuICAgIGlmIChleHBhbmRlZCkge1xuICAgICAgdGhpcy5fZmV0Y2hDaGlsZHJlbigpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3N0b3BGZXRjaGluZ0NoaWxkcmVuKClcbiAgICB9XG5cbiAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgIGV4cGFuZGVkLFxuICAgIH0pXG4gIH1cblxuICBfc3RvcEZldGNoaW5nQ2hpbGRyZW4gPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKHRoaXMuX3N1YnNjcmlwdGlvbiAhPSBudWxsKSB7XG4gICAgICB0aGlzLl9zdWJzY3JpcHRpb24udW5zdWJzY3JpYmUoKVxuICAgICAgdGhpcy5fc3Vic2NyaXB0aW9uID0gbnVsbFxuICAgIH1cbiAgfVxuXG4gIF9mZXRjaENoaWxkcmVuID0gKCk6IHZvaWQgPT4ge1xuICAgIHRoaXMuX3N0b3BGZXRjaGluZ0NoaWxkcmVuKClcblxuICAgIGlmICh0aGlzLl9pc0V4cGFuZGFibGUoKSkge1xuICAgICAgdGhpcy5fc3Vic2NyaXB0aW9uID0gT2JzZXJ2YWJsZS5mcm9tUHJvbWlzZSh0aGlzLnByb3BzLmV4cHJlc3Npb24uZ2V0Q2hpbGRyZW4oKSlcbiAgICAgICAgLmNhdGNoKChlcnJvcikgPT4gT2JzZXJ2YWJsZS5vZihbXSkpXG4gICAgICAgIC5tYXAoKGNoaWxkcmVuKSA9PiBFeHBlY3QudmFsdWUoKChjaGlsZHJlbjogYW55KTogSUV4cHJlc3Npb25bXSkpKVxuICAgICAgICAuc3RhcnRXaXRoKEV4cGVjdC5wZW5kaW5nKCkpXG4gICAgICAgIC5zdWJzY3JpYmUoKGNoaWxkcmVuKSA9PiB7XG4gICAgICAgICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICAgICAgICBjaGlsZHJlbixcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIF90b2dnbGVFeHBhbmQgPSAoZXZlbnQ6IFN5bnRoZXRpY01vdXNlRXZlbnQ8Pik6IHZvaWQgPT4ge1xuICAgIHRoaXMuX3NldEV4cGFuZGVkKCF0aGlzLnN0YXRlLmV4cGFuZGVkKVxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXG4gIH1cblxuICBfcmVuZGVyVmFsdWVMaW5lID0gKFxuICAgIGV4cHJlc3Npb246IFJlYWN0LkVsZW1lbnQ8YW55PiB8ID9zdHJpbmcsXG4gICAgdmFsdWU6IFJlYWN0LkVsZW1lbnQ8YW55PiB8IHN0cmluZ1xuICApOiBSZWFjdC5FbGVtZW50PGFueT4gPT4ge1xuICAgIGlmIChleHByZXNzaW9uID09IG51bGwpIHtcbiAgICAgIHJldHVybiA8ZGl2IGNsYXNzTmFtZT1cIm51Y2xpZGUtdWktZXhwcmVzc2lvbi10cmVlLXZhbHVlLWNvbnRhaW5lciBuYXRpdmUta2V5LWJpbmRpbmdzXCI+e3ZhbHVlfTwvZGl2PlxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5wcm9wcy5oaWRlRXhwcmVzc2lvbk5hbWUgPyAoXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibnVjbGlkZS11aS1sYXp5LW5lc3RlZC12YWx1ZS1jb250YWluZXIgbmF0aXZlLWtleS1iaW5kaW5nc1wiPnt2YWx1ZX08L2Rpdj5cbiAgICAgICkgOiAoXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibnVjbGlkZS11aS1sYXp5LW5lc3RlZC12YWx1ZS1jb250YWluZXIgbmF0aXZlLWtleS1iaW5kaW5nc1wiPlxuICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT17VmFsdWVDb21wb25lbnRDbGFzc05hbWVzLmlkZW50aWZpZXJ9PntleHByZXNzaW9ufTwvc3Bhbj46IHt2YWx1ZX1cbiAgICAgICAgPC9kaXY+XG4gICAgICApXG4gICAgfVxuICB9XG5cbiAgX3JlbmRlckNoaWxkID0gKGNoaWxkOiBJRXhwcmVzc2lvbik6IFJlYWN0Lk5vZGUgPT4ge1xuICAgIGNvbnN0IG5vZGVQYXRoID0gdGhpcy5wcm9wcy5ub2RlUGF0aCArIFwiL1wiICsgY2hpbGQubmFtZVxuICAgIHJldHVybiAoXG4gICAgICA8VHJlZUl0ZW0ga2V5PXtub2RlUGF0aH0+XG4gICAgICAgIDxFeHByZXNzaW9uVHJlZU5vZGUgZXhwcmVzc2lvbj17Y2hpbGR9IGV4cGFuc2lvbkNhY2hlPXt0aGlzLnByb3BzLmV4cGFuc2lvbkNhY2hlfSBub2RlUGF0aD17bm9kZVBhdGh9IC8+XG4gICAgICA8L1RyZWVJdGVtPlxuICAgIClcbiAgfVxuXG4gIF9nZXRWYXJpYWJsZUV4cHJlc3Npb24oKTogP0lWYXJpYWJsZSB7XG4gICAgY29uc3QgeyBleHByZXNzaW9uIH0gPSB0aGlzLnByb3BzXG4gICAgcmV0dXJuIChleHByZXNzaW9uOiBhbnkpLmNhblNldFZhcmlhYmxlID09IG51bGwgfHwgKGV4cHJlc3Npb246IGFueSkuc2V0VmFyaWFibGUgPT0gbnVsbCA/IG51bGwgOiAoZXhwcmVzc2lvbjogYW55KVxuICB9XG5cbiAgX2lzRWRpdGFibGUgPSAoKTogYm9vbGVhbiA9PiB7XG4gICAgY29uc3QgdmFyaWFibGUgPSB0aGlzLl9nZXRWYXJpYWJsZUV4cHJlc3Npb24oKVxuICAgIHJldHVybiB2YXJpYWJsZSAhPSBudWxsICYmIHZhcmlhYmxlLmNhblNldFZhcmlhYmxlKCkgJiYgIXRoaXMucHJvcHMucmVhZE9ubHlcbiAgfVxuXG4gIF91cGRhdGVWYWx1ZSA9ICgpOiB2b2lkID0+IHtcbiAgICBjb25zdCB7IHBlbmRpbmdWYWx1ZSB9ID0gdGhpcy5zdGF0ZVxuICAgIGNvbnN0IHZhcmlhYmxlID0gbnVsbHRocm93cyh0aGlzLl9nZXRWYXJpYWJsZUV4cHJlc3Npb24oKSlcblxuICAgIGNvbnN0IGRvRWRpdCA9IHBlbmRpbmdWYWx1ZSAhPSBudWxsXG4gICAgdGhpcy5fY2FuY2VsRWRpdChkb0VkaXQpXG5cbiAgICBpZiAoZG9FZGl0KSB7XG4gICAgICBpbnZhcmlhbnQocGVuZGluZ1ZhbHVlICE9IG51bGwpXG4gICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBPYnNlcnZhYmxlLmZyb21Qcm9taXNlKHZhcmlhYmxlLnNldFZhcmlhYmxlKHBlbmRpbmdWYWx1ZSkpXG4gICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICBpZiAoZXJyb3IgIT0gbnVsbCAmJiBlcnJvci5tZXNzYWdlICE9IG51bGwpIHtcbiAgICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihgRmFpbGVkIHRvIHNldCB2YXJpYWJsZSB2YWx1ZTogJHtTdHJpbmcoZXJyb3IubWVzc2FnZSl9YClcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUub2YobnVsbClcbiAgICAgICAgfSlcbiAgICAgICAgLnN1YnNjcmliZSgoKSA9PiB7XG4gICAgICAgICAgdGhpcy5fZGlzcG9zYWJsZXMucmVtb3ZlKHN1YnNjcmlwdGlvbilcbiAgICAgICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgICAgIHBlbmRpbmdTYXZlOiBmYWxzZSxcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuXG4gICAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoc3Vic2NyaXB0aW9uKVxuICAgIH1cbiAgfVxuXG4gIF9jYW5jZWxFZGl0ID0gKHBlbmRpbmdTYXZlOiA/Ym9vbGVhbiA9IGZhbHNlKTogdm9pZCA9PiB7XG4gICAgY29uc3QgbmV3U3RhdGU6IE9iamVjdCA9IHtcbiAgICAgIGlzRWRpdGluZzogZmFsc2UsXG4gICAgICBwZW5kaW5nVmFsdWU6IG51bGwsXG4gICAgfVxuICAgIGlmIChwZW5kaW5nU2F2ZSAhPSBudWxsKSB7XG4gICAgICBuZXdTdGF0ZS5wZW5kaW5nU2F2ZSA9IHBlbmRpbmdTYXZlXG4gICAgfVxuICAgIHRoaXMuc2V0U3RhdGUobmV3U3RhdGUpXG4gIH1cblxuICBfc3RhcnRFZGl0ID0gKCk6IHZvaWQgPT4ge1xuICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgaXNFZGl0aW5nOiB0cnVlLFxuICAgICAgcGVuZGluZ1ZhbHVlOiBudWxsLFxuICAgICAgcGVuZGluZ1NhdmU6IGZhbHNlLFxuICAgIH0pXG4gIH1cblxuICBfZ2V0VmFsdWVBc1N0cmluZyA9IChleHByZXNzaW9uOiBJRXhwcmVzc2lvbik6IHN0cmluZyA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBleHByZXNzaW9uLmdldFZhbHVlKClcbiAgICBpZiAodmFsdWUgIT0gbnVsbCAmJiBleHByZXNzaW9uLnR5cGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIHJldHVybiBTVFJJTkdfUkVHRVgudGVzdCh2YWx1ZSkgPyB2YWx1ZSA6IGBcIiR7dmFsdWV9XCJgXG4gICAgfVxuICAgIHJldHVybiB2YWx1ZSB8fCBcIlwiXG4gIH1cblxuICBfc2V0RWRpdG9yR3JhbW1hciA9IChlZGl0b3I6ID9BdG9tSW5wdXQpOiB2b2lkID0+IHtcbiAgICBpZiAoZWRpdG9yID09IG51bGwpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IHZhcmlhYmxlID0gdGhpcy5fZ2V0VmFyaWFibGVFeHByZXNzaW9uKClcbiAgICBpZiAodmFyaWFibGUgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKHZhcmlhYmxlLmdyYW1tYXJOYW1lICE9IG51bGwgJiYgdmFyaWFibGUuZ3JhbW1hck5hbWUgIT09IFwiXCIpIHtcbiAgICAgIGNvbnN0IGdyYW1tYXIgPSBhdG9tLmdyYW1tYXJzLmdyYW1tYXJGb3JTY29wZU5hbWUodmFyaWFibGUuZ3JhbW1hck5hbWUpXG4gICAgICBpZiAoZ3JhbW1hciA9PSBudWxsKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgZWRpdG9yLmdldFRleHRFZGl0b3IoKS5zZXRHcmFtbWFyKGdyYW1tYXIpXG4gICAgfVxuICB9XG5cbiAgX3JlbmRlckVkaXRWaWV3ID0gKGV4cHJlc3Npb246IElFeHByZXNzaW9uKTogUmVhY3QuRWxlbWVudDxhbnk+ID0+IHtcbiAgICByZXR1cm4gKFxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJleHByZXNzaW9uLXRyZWUtbGluZS1jb250cm9sXCI+XG4gICAgICAgIDxBdG9tSW5wdXRcbiAgICAgICAgICBjbGFzc05hbWU9XCJleHByZXNzaW9uLXRyZWUtdmFsdWUtYm94IGlubGluZS1ibG9ja1wiXG4gICAgICAgICAgc2l6ZT1cInNtXCJcbiAgICAgICAgICBhdXRvZm9jdXM9e3RydWV9XG4gICAgICAgICAgc3RhcnRTZWxlY3RlZD17ZmFsc2V9XG4gICAgICAgICAgaW5pdGlhbFZhbHVlPXt0aGlzLl9nZXRWYWx1ZUFzU3RyaW5nKGV4cHJlc3Npb24pfVxuICAgICAgICAgIG9uRGlkQ2hhbmdlPXsocGVuZGluZ1ZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnNldFN0YXRlKHsgcGVuZGluZ1ZhbHVlOiBwZW5kaW5nVmFsdWUudHJpbSgpIH0pXG4gICAgICAgICAgfX1cbiAgICAgICAgICBvbkNvbmZpcm09e3RoaXMuX3VwZGF0ZVZhbHVlfVxuICAgICAgICAgIG9uQ2FuY2VsPXsoKSA9PiB0aGlzLl9jYW5jZWxFZGl0KCl9XG4gICAgICAgICAgb25CbHVyPXsoKSA9PiB0aGlzLl9jYW5jZWxFZGl0KCl9XG4gICAgICAgICAgcmVmPXt0aGlzLl9zZXRFZGl0b3JHcmFtbWFyfVxuICAgICAgICAvPlxuICAgICAgICA8SWNvblxuICAgICAgICAgIGljb249XCJjaGVja1wiXG4gICAgICAgICAgdGl0bGU9XCJTYXZlIGNoYW5nZXNcIlxuICAgICAgICAgIGNsYXNzTmFtZT1cImV4cHJlc3Npb24tdHJlZS1lZGl0LWJ1dHRvbi1jb25maXJtXCJcbiAgICAgICAgICBvbkNsaWNrPXt0aGlzLl91cGRhdGVWYWx1ZX1cbiAgICAgICAgLz5cbiAgICAgICAgPEljb25cbiAgICAgICAgICBpY29uPVwieFwiXG4gICAgICAgICAgdGl0bGU9XCJDYW5jZWwgY2hhbmdlc1wiXG4gICAgICAgICAgY2xhc3NOYW1lPVwiZXhwcmVzc2lvbi10cmVlLWVkaXQtYnV0dG9uLWNhbmNlbFwiXG4gICAgICAgICAgb25DbGljaz17dGhpcy5fY2FuY2VsRWRpdH1cbiAgICAgICAgLz5cbiAgICAgIDwvZGl2PlxuICAgIClcbiAgfVxuXG4gIF9yZW5kZXJFZGl0SG92ZXJDb250cm9scygpOiA/UmVhY3QuRWxlbWVudDxhbnk+IHtcbiAgICBpZiAoIXRoaXMuX2lzRWRpdGFibGUoKSB8fCB0aGlzLnN0YXRlLmlzRWRpdGluZykge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gICAgcmV0dXJuIChcbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItc2NvcGVzLXZpZXctY29udHJvbHNcIj5cbiAgICAgICAgPEljb25cbiAgICAgICAgICBpY29uPVwicGVuY2lsXCJcbiAgICAgICAgICBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zY29wZXMtdmlldy1lZGl0LWNvbnRyb2xcIlxuICAgICAgICAgIG9uQ2xpY2s9eyhfKSA9PiB7XG4gICAgICAgICAgICB0cmFjayhFRElUX1ZBTFVFX0ZST01fSUNPTilcbiAgICAgICAgICAgIHRoaXMuX3N0YXJ0RWRpdCgpXG4gICAgICAgICAgfX1cbiAgICAgICAgLz5cbiAgICAgIDwvZGl2PlxuICAgIClcbiAgfVxuXG4gIHJlbmRlcigpOiBSZWFjdC5Ob2RlIHtcbiAgICBjb25zdCB7IHBlbmRpbmcsIGV4cHJlc3Npb24gfSA9IHRoaXMucHJvcHNcbiAgICBjb25zdCB7IHBlbmRpbmdTYXZlIH0gPSB0aGlzLnN0YXRlXG4gICAgaWYgKHBlbmRpbmcgfHwgcGVuZGluZ1NhdmUpIHtcbiAgICAgIC8vIFZhbHVlIG5vdCBhdmFpbGFibGUgeWV0LiBTaG93IGEgZGVsYXllZCBsb2FkaW5nIHNwaW5uZXIuXG4gICAgICByZXR1cm4gKFxuICAgICAgICA8VHJlZUl0ZW0gY2xhc3NOYW1lPVwibnVjbGlkZS11aS1leHByZXNzaW9uLXRyZWUtdmFsdWUtc3Bpbm5lclwiPlxuICAgICAgICAgIDxMb2FkaW5nU3Bpbm5lciBzaXplPVwiRVhUUkFfU01BTExcIiBkZWxheT17U1BJTk5FUl9ERUxBWX0gLz5cbiAgICAgICAgPC9UcmVlSXRlbT5cbiAgICAgIClcbiAgICB9XG5cbiAgICBjb25zdCBpc0VkaXRhYmxlID0gdGhpcy5faXNFZGl0YWJsZSgpXG4gICAgaWYgKCF0aGlzLl9pc0V4cGFuZGFibGUoKSkge1xuICAgICAgLy8gVGhpcyBpcyBhIHNpbXBsZSB2YWx1ZSB3aXRoIG5vIGNoaWxkcmVuLlxuICAgICAgcmV0dXJuIChcbiAgICAgICAgPGRpdlxuICAgICAgICAgIG9uRG91YmxlQ2xpY2s9e2lzRWRpdGFibGUgJiYgIXRoaXMuc3RhdGUuaXNFZGl0aW5nID8gdGhpcy5fc3RhcnRFZGl0IDogKCkgPT4ge319XG4gICAgICAgICAgY2xhc3NOYW1lPVwiZXhwcmVzc2lvbi10cmVlLWxpbmUtY29udHJvbFwiXG4gICAgICAgID5cbiAgICAgICAgICB7dGhpcy5zdGF0ZS5pc0VkaXRpbmcgPyAoXG4gICAgICAgICAgICB0aGlzLl9yZW5kZXJFZGl0VmlldyhleHByZXNzaW9uKVxuICAgICAgICAgICkgOiAoXG4gICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJuYXRpdmUta2V5LWJpbmRpbmdzIGV4cHJlc3Npb24tdHJlZS12YWx1ZS1ib3hcIj5cbiAgICAgICAgICAgICAgPFNpbXBsZVZhbHVlQ29tcG9uZW50IGV4cHJlc3Npb249e2V4cHJlc3Npb259IC8+XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgKX1cbiAgICAgICAgICB7aXNFZGl0YWJsZSA/IHRoaXMuX3JlbmRlckVkaXRIb3ZlckNvbnRyb2xzKCkgOiBudWxsfVxuICAgICAgICA8L2Rpdj5cbiAgICAgIClcbiAgICB9XG5cbiAgICAvLyBBIG5vZGUgd2l0aCBhIGRlbGF5ZWQgc3Bpbm5lciB0byBkaXNwbGF5IGlmIHdlJ3JlIGV4cGFuZGVkLCBidXQgd2FpdGluZyBmb3JcbiAgICAvLyBjaGlsZHJlbiB0byBiZSBmZXRjaGVkLlxuICAgIGNvbnN0IHBlbmRpbmdDaGlsZHJlbk5vZGUgPSAoXG4gICAgICA8RXhwcmVzc2lvblRyZWVOb2RlXG4gICAgICAgIGV4cHJlc3Npb249e3RoaXMucHJvcHMuZXhwcmVzc2lvbn1cbiAgICAgICAgcGVuZGluZz17dHJ1ZX1cbiAgICAgICAgZXhwYW5zaW9uQ2FjaGU9e3RoaXMucHJvcHMuZXhwYW5zaW9uQ2FjaGV9XG4gICAgICAgIG5vZGVQYXRoPXt0aGlzLnByb3BzLm5vZGVQYXRofVxuICAgICAgLz5cbiAgICApXG5cbiAgICAvLyBJZiBjb2xsYXBzZWQsIHJlbmRlciBubyBjaGlsZHJlbi4gT3RoZXJ3aXNlIGVpdGhlciByZW5kZXIgdGhlIHBlbmRpbmdDaGlsZHJlbk5vZGVcbiAgICAvLyBpZiB0aGUgZmV0Y2ggaGFzbid0IGNvbXBsZXRlZCwgb3IgdGhlIGNoaWxkcmVuIGlmIHdlJ3ZlIGdvdCB0aGVtLlxuICAgIGxldCBjaGlsZHJlblxuICAgIGlmICghdGhpcy5zdGF0ZS5leHBhbmRlZCkge1xuICAgICAgY2hpbGRyZW4gPSBudWxsXG4gICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlLmNoaWxkcmVuLmlzUGVuZGluZykge1xuICAgICAgY2hpbGRyZW4gPSBwZW5kaW5nQ2hpbGRyZW5Ob2RlXG4gICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlLmNoaWxkcmVuLmlzRXJyb3IpIHtcbiAgICAgIGNoaWxkcmVuID0gdGhpcy5fcmVuZGVyVmFsdWVMaW5lKFxuICAgICAgICBcIkNoaWxkcmVuXCIsXG4gICAgICAgIHRoaXMuc3RhdGUuY2hpbGRyZW4uZXJyb3IgIT0gbnVsbCA/IHRoaXMuc3RhdGUuY2hpbGRyZW4uZXJyb3IudG9TdHJpbmcoKSA6IE5PVF9BVkFJTEFCTEVfTUVTU0FHRVxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICBjaGlsZHJlbiA9IHRoaXMuc3RhdGUuY2hpbGRyZW4udmFsdWUubWFwKChjaGlsZCkgPT4gdGhpcy5fcmVuZGVyQ2hpbGQoY2hpbGQpKVxuICAgIH1cblxuICAgIHJldHVybiAoXG4gICAgICA8VHJlZUxpc3Qgc2hvd0Fycm93cz17dHJ1ZX0gY2xhc3NOYW1lPVwibnVjbGlkZS11aS1leHByZXNzaW9uLXRyZWUtdmFsdWUtdHJlZWxpc3RcIj5cbiAgICAgICAgPE5lc3RlZFRyZWVJdGVtXG4gICAgICAgICAgY29sbGFwc2VkPXshdGhpcy5zdGF0ZS5leHBhbmRlZH1cbiAgICAgICAgICBvbkNvbmZpcm09e2lzRWRpdGFibGUgPyB0aGlzLl9zdGFydEVkaXQgOiAoKSA9PiB7fX1cbiAgICAgICAgICBvblNlbGVjdD17dGhpcy5zdGF0ZS5pc0VkaXRpbmcgPyAoKSA9PiB7fSA6IHRoaXMuX3RvZ2dsZU5vZGVFeHBhbmRlZH1cbiAgICAgICAgICB0aXRsZT17XG4gICAgICAgICAgICB0aGlzLnN0YXRlLmlzRWRpdGluZ1xuICAgICAgICAgICAgICA/IHRoaXMuX3JlbmRlckVkaXRWaWV3KGV4cHJlc3Npb24pXG4gICAgICAgICAgICAgIDogdGhpcy5fcmVuZGVyVmFsdWVMaW5lKGV4cHJlc3Npb24ubmFtZSwgZXhwcmVzc2lvbi5nZXRWYWx1ZSgpKVxuICAgICAgICAgIH1cbiAgICAgICAgPlxuICAgICAgICAgIHtjaGlsZHJlbn1cbiAgICAgICAgPC9OZXN0ZWRUcmVlSXRlbT5cbiAgICAgIDwvVHJlZUxpc3Q+XG4gICAgKVxuICB9XG59XG5cbmV4cG9ydCB0eXBlIEV4cHJlc3Npb25UcmVlQ29tcG9uZW50UHJvcHMgPSB7XG4gIGV4cHJlc3Npb246IElFeHByZXNzaW9uLFxuICBjb250YWluZXJDb250ZXh0OiBPYmplY3QsXG4gIHBlbmRpbmc/OiBib29sZWFuLFxuICBjbGFzc05hbWU/OiBzdHJpbmcsXG4gIGhpZGVFeHByZXNzaW9uTmFtZT86IGJvb2xlYW4sXG4gIHJlYWRPbmx5PzogYm9vbGVhbixcbn1cblxuZXhwb3J0IGNsYXNzIEV4cHJlc3Npb25UcmVlQ29tcG9uZW50IGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50PEV4cHJlc3Npb25UcmVlQ29tcG9uZW50UHJvcHM+IHtcbiAgY29uc3RydWN0b3IocHJvcHM6IEV4cHJlc3Npb25UcmVlQ29tcG9uZW50UHJvcHMpIHtcbiAgICBzdXBlcihwcm9wcylcbiAgfVxuXG4gIF9nZXRFeHBhbnNpb25DYWNoZSA9ICgpOiBNYXA8c3RyaW5nLCBib29sZWFuPiA9PiB7XG4gICAgbGV0IGNhY2hlID0gRXhwYW5zaW9uU3RhdGVzLmdldCh0aGlzLnByb3BzLmNvbnRhaW5lckNvbnRleHQpXG4gICAgaWYgKGNhY2hlID09IG51bGwpIHtcbiAgICAgIGNhY2hlID0gbmV3IE1hcCgpXG4gICAgICBFeHBhbnNpb25TdGF0ZXMuc2V0KHRoaXMucHJvcHMuY29udGFpbmVyQ29udGV4dCwgY2FjaGUpXG4gICAgfVxuICAgIHJldHVybiBjYWNoZVxuICB9XG5cbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGNsYXNzbmFtZXModGhpcy5wcm9wcy5jbGFzc05hbWUsIHtcbiAgICAgIFwibnVjbGlkZS11aS1leHByZXNzaW9uLXRyZWUtdmFsdWVcIjogdGhpcy5wcm9wcy5jbGFzc05hbWUgPT0gbnVsbCxcbiAgICB9KVxuICAgIHJldHVybiAoXG4gICAgICA8c3BhbiBjbGFzc05hbWU9e2NsYXNzTmFtZX0gdGFiSW5kZXg9ey0xfT5cbiAgICAgICAgPEV4cHJlc3Npb25UcmVlTm9kZVxuICAgICAgICAgIGV4cHJlc3Npb249e3RoaXMucHJvcHMuZXhwcmVzc2lvbn1cbiAgICAgICAgICBwZW5kaW5nPXt0aGlzLnByb3BzLnBlbmRpbmd9XG4gICAgICAgICAgbm9kZVBhdGg9XCJyb290XCJcbiAgICAgICAgICBleHBhbnNpb25DYWNoZT17dGhpcy5fZ2V0RXhwYW5zaW9uQ2FjaGUoKX1cbiAgICAgICAgICBoaWRlRXhwcmVzc2lvbk5hbWU9e3RoaXMucHJvcHMuaGlkZUV4cHJlc3Npb25OYW1lfVxuICAgICAgICAgIHJlYWRPbmx5PXt0aGlzLnByb3BzLnJlYWRPbmx5fVxuICAgICAgICAvPlxuICAgICAgPC9zcGFuPlxuICAgIClcbiAgfVxufVxuIl19