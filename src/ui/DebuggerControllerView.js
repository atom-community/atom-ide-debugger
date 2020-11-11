import type { IDebugService } from "../types"

import { observableFromSubscribeFunction } from "@atom-ide-community/nuclide-commons/event"
import * as React from "react"
import { LoadingSpinner } from "@atom-ide-community/nuclide-commons-ui/LoadingSpinner"
import UniversalDisposable from "@atom-ide-community/nuclide-commons/UniversalDisposable"
import { Observable } from "rxjs-compat/bundles/rxjs-compat.umd.min.js"
import { DebuggerMode } from "../constants"

type Props = {
  service: IDebugService,
}

export default class DebuggerControllerView extends React.Component<Props> {
  _disposables: UniversalDisposable

  constructor(props: Props) {
    super(props)
    this._disposables = new UniversalDisposable()
  }

  componentDidMount() {
    const { service } = this.props
    this._disposables.add(
      Observable.merge(
        observableFromSubscribeFunction(service.viewModel.onDidChangeDebuggerFocus.bind(service.viewModel)),
        observableFromSubscribeFunction(service.onDidChangeProcessMode.bind(service))
      ).subscribe((mode) => this.forceUpdate())
    )
  }

  componentWillUnmount(): void {
    this._disposables.dispose()
  }

  render(): React.Node {
    if (this.props.service.viewModel.focusedProcess?.debuggerMode === DebuggerMode.STARTING) {
      return (
        <div className="debugger-starting-message">
          <div>
            <span className="inline-block">Starting Debugger...</span>
            <LoadingSpinner className="inline-block" size="EXTRA_SMALL" />
          </div>
        </div>
      )
    }
    return null
  }
}
