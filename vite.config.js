import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl';

// https://vitejs.dev/config/
export default defineConfig({
    server:{
        port:8177,
        hmr:false//true//false // auto/manmual refresh
    },

    plugins: [
        glsl()

    ],
})
