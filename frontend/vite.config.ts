import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'127.0.0.1',port:5175,strictPort:true,proxy:{'/api':'http://127.0.0.1:8080','/actuator':'http://127.0.0.1:8080'}},test:{environment:'jsdom',setupFiles:['./src/test/setup.ts']},build:{target:'es2023',rolldownOptions:{input:{app:'index.html',assistant:'assistant/index.html'}}}});
