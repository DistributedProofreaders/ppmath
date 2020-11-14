#!/usr/bin/env node

var fs = require("fs");
var mjAPI = require("mathjax-node");
const crypto = require("crypto");
const program = require("commander");
const speechEngine = require('speech-rule-engine');

program
    .option("-i, --in-file <infile>", "input file")
    .option("-o --out-file <outfile>", "output file")
    .option("-l --locale <locale>", "locale", "en");

program.parse(process.argv);
if(!program.inFile || !program.outFile) {
    console .log("use 'ppmconvert -i infile -o outfile (-l locale)'");
    process.exit();
}

mjAPI.config({
    MathJax: {
        // traditional MathJax configuration
    }
});

mjAPI.start();

var textIn;
var textOut = "";
const imageDir = "images";
if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir);
}

const processText = async () => {

    function toBuffer(txt) {
        textOut += txt;
    }

    function reportError(msg) {
        toBuffer(` ******* ${msg} ******* `);
        console.log(msg);
    }

    const writeMath = async (mathTxt, tag) => {
        let texFormat = (tag === '(') ? "inline-TeX" : "TeX";
        try {
            const data = await mjAPI.typeset({
                math: mathTxt,
                format: texFormat,
                svg: true,
                mml: true
            });

            // make a file name from the equation
            const hash = crypto.createHmac("md5", mathTxt).digest("hex");
            var fileName = `${imageDir}/${hash}.svg`;
            fs.writeFileSync(fileName, data.svg);
            let source = `src="${fileName}"`;
            let speech = speechEngine.toSpeech(data.mml);
            let alt = `alt='${speech}'`;
            if(texFormat === "TeX") {
                toBuffer(`<span class="align-center"><img ${source} ${alt} data-tex="[${mathTxt}]"></span>`);
            } else {
                toBuffer(`<img style="${data.style}" ${source} ${alt} data-tex="(${mathTxt})">`);
            }
            // indicate progress
            process.stdout.write(".");

        } catch(err) {
            reportError(err);
            // output the faulty text
            toBuffer(mathTxt);
        }
    };

    let startIndex = 0;
    let txtBlock = "";
    let mathRegex = /\\\[|\\\]|\\\(|\\\)/g;
    let result;
    let openTag = false;
    while((result = mathRegex.exec(textIn)) !== null) {
        let endIndex;
        let tag = result[0].charAt(1);
        if ((tag === '(') || (tag === '[')) {
            // exclude tag from text block
            endIndex = result.index;
            txtBlock = textIn.slice(startIndex, endIndex);

            if(openTag) {
                reportError(`no end tag for \\${openTag}`);
            }
            // resynch to this tag anyway
            openTag = tag;
            toBuffer(txtBlock);
        } else {
            // must be ) or ] include tag in text block
            endIndex = result.index + 2;
            txtBlock = textIn.slice(startIndex, endIndex);
            if(!openTag) {
                reportError(`no start tag for \\${tag}`);
                toBuffer(txtBlock);
            } else if (((openTag === '(') && (tag === ')')) || ((openTag === '[') && (tag === ']'))) {
                // correctly matched
                await writeMath(txtBlock.slice(2, -2), openTag);
            } else {
                reportError(`mismatched closing tag \\${tag}`);
                toBuffer(txtBlock);
            }
            openTag = false;
        }
        startIndex = endIndex;
    }

    if (openTag) {
        reportError(`no end tag for \\${openTag}`);
    }

    // copy remaining text
    toBuffer(textIn.slice(startIndex));
    fs.writeFileSync(program.outFile, textOut);
    console.log("Finished");
};

textIn = fs.readFileSync(program.inFile, "utf8");
speechEngine.setupEngine({
    domain: 'clearspeak',
    locale: program.locale,
});

processText();
