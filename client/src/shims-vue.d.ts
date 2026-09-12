/** Lets TypeScript import `.vue` single-file components without type errors (Vue's own types don't cover raw `.vue` module resolution). */
declare module '*.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

/** Image imports resolved by Vite's asset pipeline to their published URL. */
declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.jpeg' {
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}

/*
 * Stylesheets are consumed for their side effects and handled entirely by
 * Vite's pipeline, so there is nothing to type. TypeScript 7 no longer lets a
 * side-effect import resolve to nothing and errors with TS2882 without these.
 */
declare module '*.css';
declare module '*.scss';

/** Vuetify's prebuilt stylesheet - a package subpath, so the wildcards above don't cover it. */
declare module 'vuetify/styles';
