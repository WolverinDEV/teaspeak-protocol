import * as path from "path";
import * as webpack from "webpack";

const config: webpack.Configuration = {
    mode: 'production',
    entry: path.join(__dirname, "messages.ts"),

    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader'
            },
        ],
    },
    resolve: {
        extensions: [ '.ts' ],
    },

    target: "web",
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'messages.js',

        library: "teaclient-protocol",
        libraryTarget: "umd",
    }
};

export default config;