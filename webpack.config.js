const path = require("path");

module.exports = {
	mode: "development",
	entry: "./src/receiver.ts",
	output: {
		filename: "receiver.js",
		path: path.resolve(__dirname, "public/js"),
	},
	resolve: {
		extensions: [".ts", ".js"],
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: "ts-loader",
			},
		],
	},
};
