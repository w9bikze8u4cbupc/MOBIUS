module.exports = {
  testEnvironment: "node",
  transform: { 
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "tsconfig.json" }],
    "^.+\\.(js|jsx)$": "babel-jest"
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx,js,jsx}"],
  coverageDirectory: "coverage",
  reporters: ["default", ["jest-junit", { outputDirectory: "test-results", outputName: "junit.xml" }]],
  transformIgnorePatterns: [
    "node_modules/(?!axios)/"
  ]
};