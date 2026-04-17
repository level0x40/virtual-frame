// Tell React this is a valid act() environment so it stops warning
// about state updates that happen outside an explicit act() wrapper.
// See https://react.dev/reference/react/act#error-the-current-testing-environment-is-not-configured-to-support-act
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
