import type { IDebugService } from "../types"

import classnames from "classnames"
import UniversalDisposable from "@atom-ide-community/nuclide-commons/UniversalDisposable"
import * as React from "react"
import { bindObservableAsProps } from "@atom-ide-community/nuclide-commons-ui/bindObservableAsProps"
import { Observable } from "rxjs-compat/bundles/rxjs-compat.umd.min.js"
import WatchExpressionComponent from "./WatchExpressionComponent"
import { observableFromSubscribeFunction } from "@atom-ide-community/nuclide-commons/event"

type Props = {
  service: IDebugService,
}

export default class WatchView extends React.PureComponent<Props> {
  _watchExpressionComponentWrapped: React.ComponentType<any>
  _disposables: UniversalDisposable

  constructor(props: Props) {
    super(props)
    const { service } = props
    const { viewModel } = service
    const model = service.getModel()
    const watchExpressionChanges = observableFromSubscribeFunction(model.onDidChangeWatchExpressions.bind(model))
    const focusChanges = observableFromSubscribeFunction(viewModel.onDidChangeDebuggerFocus.bind(viewModel))
    const expressionContextChanges = observableFromSubscribeFunction(
      viewModel.onDidChangeExpressionContext.bind(viewModel)
    )
    this._watchExpressionComponentWrapped = bindObservableAsProps(
      Observable.merge(watchExpressionChanges, focusChanges, expressionContextChanges)
        .startWith(null)
        .map(() => ({
          focusedProcess: viewModel.focusedProcess,
          focusedStackFrame: viewModel.focusedStackFrame,
          watchExpressions: model.getWatchExpressions(),
        })),
      WatchExpressionComponent
    )
  }

  render(): React.Node {
    const { service } = this.props
    const WatchExpressionComponentWrapped = this._watchExpressionComponentWrapped

    return (
      <div className={classnames("debugger-container-new")}>
        <div className="debugger-pane-content">
          <WatchExpressionComponentWrapped
            onAddWatchExpression={service.addWatchExpression.bind(service)}
            onRemoveWatchExpression={service.removeWatchExpressions.bind(service)}
            onUpdateWatchExpression={service.renameWatchExpression.bind(service)}
          />
        </div>
      </div>
    )
  }
}
