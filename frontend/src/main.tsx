import {createRoot} from 'react-dom/client';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/700.css';
import '@fontsource/noto-sans-kr/900.css';
import './styles.css';
import App from './App';
const root = createRoot(document.getElementById('root')!);
if (location.pathname.replace(/\/$/,'') === '/evaluation-report') {
  void import('./assessment/EvaluationReport').then(({default:Report}) => root.render(<Report/>));
} else root.render(<App/>);
