import { render } from 'preact';
import './styles.css';
import { initApp } from './app/actions';
import { App } from './app/App';
import { registerSW } from './app/sw';
import { applyTheme, getTheme } from './app/theme';

applyTheme(getTheme());

const root = document.getElementById('app')!;
root.textContent = '';
render(<App />, root);
void initApp();
registerSW();
