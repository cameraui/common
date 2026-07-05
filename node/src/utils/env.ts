const env: Record<string, string | undefined> = typeof process !== 'undefined' && process.env ? process.env : {};

export const IS_DEV = env.NODE_ENV === 'development';
export const IS_DOCKER = env.CAMERA_UI_RUNMODE === 'docker';
export const IS_ELECTRON = env.CAMERA_UI_RUNMODE === 'electron';
export const IS_HA = env.CAMERA_UI_RUNMODE === 'homeassistant';

export const APP_CLI_NAME = 'camera.ui';
export const APP_SERVER_NAME = '@camera.ui/server';
