import { systemApi } from './systemApi'
import { browserApi } from './browserApi'
import { terminalApi } from './terminalApi'
import { contentApi } from './contentApi'

export const api = { ...systemApi, ...browserApi, ...terminalApi, ...contentApi }
