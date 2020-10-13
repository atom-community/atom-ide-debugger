import type { IDebugService, RemoteDebuggerService } from "./types"
import type { IProcessConfig } from "@atom-ide-community/nuclide-debugger-common"

export default class RemoteControlService implements RemoteDebuggerService {
  _service: IDebugService

  constructor(service: IDebugService) {
    this._service = service
  }

  startVspDebugging(config: IProcessConfig): Promise<void> {
    return this._service.startDebugging(config)
  }

  onDidChangeDebuggerSessions(callback: (sessionConfigs: IProcessConfig[]) => mixed): IDisposable {
    return this._service.getModel().onDidChangeProcesses(() => {
      callback(
        this._service
          .getModel()
          .getProcesses()
          .map((p) => p.configuration)
      )
    })
  }

  getDebugSessions(): IProcessConfig[] {
    return this._service
      .getModel()
      .getProcesses()
      .map((p) => p.configuration)
  }
}
