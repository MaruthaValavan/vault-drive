# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Project layout

- `Frontend/` — the browser application (the Lovable editor keeps its source at the repository root).
- `Backend/` — the standalone Node.js + Express API, intended for its own repository.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Run the separate backend

```sh
cd Backend
cp .env.example .env
npm install
npm run dev
```

Set `VITE_API_URL` in the frontend environment to the deployed backend URL when the API is not running on `localhost:4000`.
