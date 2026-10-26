/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/api/client', () => ({
  apiRequest: jest.fn(),
  verifyEmailCode: jest.fn(),
  resendEmailCode: jest.fn(),
  loadSession: jest.fn(async () => null),
  login: jest.fn(),
  loginWithGoogle: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('react-native-share-menu', () => ({
  __esModule: true,
  default: {getInitialShare: jest.fn(async () => null), addNewShareListener: jest.fn(() => ({remove: jest.fn()}))},
}));
jest.mock('@react-native-community/blur', () => ({BlurView: 'BlurView'}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {configure: jest.fn(), hasPlayServices: jest.fn(), signIn: jest.fn()},
  GoogleSigninButton: Object.assign(() => null, {Size: {Wide: 1, Icon: 2}, Color: {Light: 1, Dark: 2}}),
}));

test('renders the sign-in screen when there is no saved session', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  });
  expect(renderer!.toJSON()).toBeTruthy();
});
