import { installI18n } from './src/i18n';
installI18n();
// eslint-disable-next-line import/first
import { registerRootComponent } from 'expo';
// eslint-disable-next-line import/first
import App from './App';

registerRootComponent(App);
