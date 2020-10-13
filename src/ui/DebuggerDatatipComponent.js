import type { Expected } from "@atom-ide-community/nuclide-commons/expected"
import type { IExpression } from "../types"

import { LoadingSpinner } from "@atom-ide-community/nuclide-commons-ui/LoadingSpinner"
import * as React from "react"
import { ExpressionTreeComponent } from "./ExpressionTreeComponent"

type Props = {|
  +expression: Expected<IExpression>,
|}

export default class DebuggerDatatipComponent extends React.Component<Props> {
  render(): React.Node {
    const { expression } = this.props
    if (expression.isPending) {
      return <LoadingSpinner delay={100} size="EXTRA_SMALL" />
    } else if (expression.isError) {
      return null
    } else {
      return (
        <div className="debugger-datatip">
          <span className="debugger-datatip-value">
            <ExpressionTreeComponent expression={expression.value} containerContext={this} />
          </span>
        </div>
      )
    }
  }
}
