/**
 * The mock-mode flag, alone in its own module.
 *
 * Importing it must not pull in the fixtures, so that when NEXT_PUBLIC_MOCK is
 * unset the bundler can drop ./data and ./index entirely. Everything that only
 * needs to *know* whether mock mode is on imports from here.
 */
export const isMockMode = process.env.NEXT_PUBLIC_MOCK === "1";
