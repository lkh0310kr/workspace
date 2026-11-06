# electron

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

Home's provider connections use the PKMS service integration API. For local end-to-end OAuth development, run the web Worker and Electron app in separate terminals:

```bash
# repository root; configure apps/web/.dev.vars with local PUBLIC_ORIGIN and provider OAuth credentials
npm run web:dev

# apps/workspace
PKMS_API_ORIGIN=http://localhost:5173 npm run dev
```

Register `http://localhost:5173/api/services/oauth/callback` in both provider OAuth apps for this local flow. Without `PKMS_API_ORIGIN`, the desktop app uses the deployed PKMS Worker; if that Worker has not yet been deployed with the service integration routes, Home reports that the API needs deployment instead of presenting the missing route as a login failure.

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
