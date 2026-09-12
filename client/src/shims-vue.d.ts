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
