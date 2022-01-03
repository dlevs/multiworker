export default {
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'MultiWorker',
      formats: ['umd'],
      fileName: () => 'multiworker.js',
    },
    sourcemap: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      }
    }
  },
};
