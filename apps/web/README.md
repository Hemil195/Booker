# Bookar web app

This folder contains the Bookar website, dashboard, user documentation, and web API. The browser
extension and optional standalone AI connection service live in other folders in this repository.

For an overview of Bookar and its plain-language user guide, start with the
[project README](../../README.md). To run or deploy your own copy, follow the
[setup and deployment guide](../../DEPLOYMENT.md).

## Run the website locally

1. Set up Supabase, Google sign-in, and the environment variables described in the project README.
2. From this folder, install dependencies and start the development server:

   ```bash
   npm install
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).

To check the production build, run `npm run build`. To run the available bookmark-category tests,
run `npm run test:category`.
