#!/usr/bin/env node

/* global MathJax */

import { parseArgs } from "node:util";

const options = {
    mode: {
        type: "string",
        short: "m",
        default: "i",
    },
    infile: {
        type: "string",
        short: "i",
    },
    outfile: {
        type: "string",
        short: "o",
    },
    margin: {
        type: "string",
        short: "g",
        default: "0.3em",
    },
    reverse: {
        type: "boolean",
        short: "r",
        default: false,
    },
};
const result = parseArgs({ options });
const values = result.values;
if (!(values.infile && values.outfile)) {
    console.log(
        "use m2svg -i infile -o outfile -m mode -g margin (where mode is i: svg image, s: inline svg, m: mathml, margin is like 0.3em) (-r to revert)",
    );
    process.exit();
}

import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import pj from "../package.json" with { type: "json" };

console.log("m2svg version ", pj.version);

const inFile = values.infile;
const outFile = values.outfile;
let lineNum;

let textIn = readFileSync(inFile, "utf8");

if (values.reverse) {
    console.log("reversing");
    textIn = textIn.replace(/<span.*?data-tex="(\\\[.*?\\])".*?<\/span>/gs, "$1");
    textIn = textIn.replace(/<span.*?data-tex="(\\\(.*?\\\))".*?<\/span>/gs, "$1");
    textIn = textIn.replace(/<img.*?data-tex="(\\\(.*?\\\))">/gs, "$1");
    writeFileSync(outFile, textIn);
    process.exit();
}

// make styles
// for inline svg MathJax.startup.adaptor.textContent(MathJax.svgStylesheet()) works but
// contains custom elements and attributes that ebookmaker doesn't like
let mStyle = "";
const margString = `margin: ${values.margin} 0;`;

const imageDir = "images";

switch (values.mode) {
    case "i":
        mStyle = `.align-center {display: block; text-align: center; ${margString}}`;
        if (!existsSync(imageDir)) {
            mkdirSync(imageDir);
        }
        break;
    case "s":
        mStyle = `.dispblock {display: block; text-align: center; ${margString}}
    .dispflex {display: flex; ${margString}}`;
        break;
    case "m":
        mStyle = `.dispmarge {display: block; ${margString}}`;
        break;
    case "d":
        // dummy run to to parse \[ \] \( \)
        break;
    default:
        console.log("unknown mode ", values.mode);
        process.exit();
        break;
}

textIn = textIn.replace("__style_holder", mStyle);

// remove html commented sections
textIn = textIn.replace(/<!--.*?-->/gs, "");

var textOut = "";
let fileSerial = 0;
const fileNumbers = new Map();
const EM = 16; // size of an em in pixels
const EX = 8; // size of an ex in pixels
const WIDTH = 80 * EM; // width of container for linebreaking
const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>';

function toBuffer(txt) {
    textOut += txt;
}

function reportError(msg) {
    console.log(`\n${msg}`);
}

global.MathJax = {
    loader: {
        paths: { mathjax: "@mathjax/src/bundle" },
        load: ["input/tex", "output/svg", "adaptors/liteDOM"],
        require: (file) => import(file),
    },
    tex: {
        macros: {
            reflect: [
                String.raw`{\style{transform: scaleX(-1); transform-origin: center; transform-box: content-box}{#1}}`,
                1,
            ],
            rotate: [
                String.raw`{\style{transform: rotate(180deg); transform-origin: center; transform-box: content-box}{#1}}`,
                1,
            ],
            scale: [String.raw`{\style{transform: scaleX(#1)}{#2}}`, 2],
        },
    },
    // additional configuration here
};

await import("@mathjax/src/bundle/startup.js");
await MathJax.startup.promise;
await convert();
MathJax.done();

async function getSvgImage(math, options = {}) {
    const adaptor = MathJax.startup.adaptor;
    const result = await MathJax.tex2svgPromise(math, options);
    const svg = adaptor.tags(result, "svg")[0];
    adaptor.removeAttribute(svg, "role");
    adaptor.removeAttribute(svg, "focusable");
    adaptor.removeAttribute(svg, "aria-hidden");
    const g = adaptor.tags(svg, "g")[0];
    adaptor.setAttribute(g, "stroke", "black");
    adaptor.setAttribute(g, "fill", "black");
    return `${xmlDeclaration}\n${adaptor.serializeXML(svg)}`;
}

function gFix(txt) {
    // remove attributes from g tags that cause validation problems in images
    txt = txt.replace(/\s*data-mml-node=".*?"/g, "");
    txt = txt.replace(/\s*data-c=".*?"/g, "");
    txt = txt.replace(/\s*data-mjx-texclass=".*?"/g, "");
    txt = txt.replace(/\s*data-latex=".*?"/gs, "");
    txt = txt.replace(/\s*data-variant=".*?"/g, "");
    txt = txt.replace(/\s*data-frame-styles=".*?"/g, "");

    return txt;
}

async function writeMath(mathTxt, inLine) {
    function errorCheck(txt) {
        const reErr = /data-mjx-error="(.*?)"/;
        const result = reErr.exec(txt);
        if (result) {
            reportError(`MathJax error near line ${lineNum}: ${result[1]} : ${mathTxt}`);
        }
    }

    // mathjax bug ?
    if (inLine) {
        mathTxt = `{${mathTxt}}`;
    }

    const options = {
        display: !inLine,
        em: EM,
        ex: EX,
        containerWidth: WIDTH,
    };

    const taggedMath = inLine ? `\\(${mathTxt}\\)` : `\\[${mathTxt}\\]`;
    const dataTex = `data-tex="${taggedMath}"`;
    if (values.mode === "d") {
        // dummy run to catch errors
    } else if (values.mode === "m") {
        // mathjax errors will get marked in mml so no need to catch
        const mml = await MathJax.tex2mmlPromise(mathTxt, options);
        errorCheck(mml);
        if (inLine) {
            toBuffer(`<span ${dataTex}>${mml}</span>`);
        } else {
            // display
            toBuffer(`<span class="dispmarge" ${dataTex}>${mml}</span>`);
        }
    } else if (values.mode === "i") {
        let svgCode = await getSvgImage(mathTxt, options);
        errorCheck(svgCode);

        // make serial file numbers and put them in a map with keys so we can
        // re-use them for the same math.
        // make a key from the original equation including end tags in case same
        // math is both display and inline.
        const hash = createHmac("md5", mathTxt).digest("hex");
        let fileNumber = fileNumbers.get(hash);
        if (fileNumber === undefined) {
            fileSerial += 1;
            fileNumber = fileSerial;
            // add it to the map
            fileNumbers.set(hash, fileNumber);
        }
        const fileName = `${imageDir}/${fileNumber}.svg`;

        // write html to display the image
        const source = `src="${fileName}"`;

        // build style for html from svg
        // need vertical-align for html
        let re = /style="vertical-align: (.+?);"/;
        let result = re.exec(svgCode);
        const vAlign = result ? result[1] : "0px";

        // for epub to work in ADE etc. we need width and height from svg also in
        // style and to replace svg width and height with values from viewBox
        re = /width="(.+?)"/;
        result = re.exec(svgCode);
        let width = result ? result[1] : "0px";

        re = /height="(.+?)"/;
        result = re.exec(svgCode);
        let height = result ? result[1] : "0px";

        const style = `style="vertical-align: ${vAlign}; width: ${width}; height: ${height};"`;

        re = /viewBox=".+? .+? (.+?) (.+?)"/;
        result = re.exec(svgCode);
        width = result[1];
        height = result[2];
        svgCode = svgCode.replace(/ width=".*?"/, ` width="${width}px"`);
        svgCode = svgCode.replace(/ height=".*?"/, ` height="${height}px"`);

        svgCode = gFix(svgCode);

        // store svg in a file
        writeFileSync(fileName, svgCode);

        const alt = `alt=""`;
        const imgTag = `<img ${style} ${source} ${alt} ${dataTex}>`;
        if (inLine) {
            toBuffer(imgTag);
        } else {
            // display
            toBuffer(`<span class="align-center">${imgTag}</span>`);
        }
    } else if (values.mode === "s") {
        const adaptor = MathJax.startup.adaptor;
        const result = await MathJax.tex2svgPromise(mathTxt, options);
        const svg = adaptor.tags(result, "svg")[0];
        // ebookmaker doesn't like 'focusable'
        adaptor.removeAttribute(svg, "focusable");
        const width = adaptor.getAttribute(svg, "width");
        let svgCode = adaptor.serializeXML(svg);
        errorCheck(svgCode);
        // works without this but it reduces file size
        svgCode = gFix(svgCode);
        if (inLine) {
            toBuffer(`<span ${dataTex}>${svgCode}</span>`);
        } else {
            const spanClass = width === "100%" ? "dispflex" : "dispblock";
            toBuffer(`<span class="${spanClass}" ${dataTex}>${svgCode}</span>`);
        }
    }
    // indicate progress
    process.stdout.write(".");
    return false;
}

async function convert() {
    let startIndex = 0;
    // look for opening or closing tags or newlines
    const mathRegex = /\\\[|\\\]|\\\(|\\\)|(\r\n|\n|\r)/g;
    let openTag = false;
    let tagIndex = 0;
    let result;
    let tag;
    // track line numbers for reporting errors
    lineNum = 1;
    let openLine = 1;

    function repMismatch() {
        reportError(`\\${openTag} at line ${openLine} followed by \\${tag} at line ${lineNum}`);
    }

    function resynch() {
        openTag = tag;
        openLine = lineNum;
        startIndex = tagIndex + 2;
    }

    async function writeOut() {
        const inLine = openTag === "(";
        const mathText = textIn.slice(startIndex, tagIndex);
        const errorText = await writeMath(mathText, inLine);
        startIndex = tagIndex + 2;
        if (errorText) {
            reportError(`MathJax error near line ${lineNum}: ${errorText} : ${mathText}`);
        }
        openTag = false;
    }

    for (;;) {
        result = mathRegex.exec(textIn);
        if (result === null) {
            break;
        }
        if (result[1]) {
            // newline
            lineNum += 1;
            continue;
        }
        tag = result[0].charAt(1);
        tagIndex = result.index;
        if (!openTag) {
            if (tag === "(" || tag === "[") {
                // copy preceding text
                toBuffer(textIn.slice(startIndex, tagIndex));
                resynch();
            } else {
                // closing tag
                reportError(`no start tag for \\${tag} at line ${lineNum}`);
            }
        } else {
            // already in math
            if (openTag === "[") {
                switch (tag) {
                    case "]":
                        await writeOut();
                        break;
                    case "[":
                        repMismatch();
                        resynch();
                        break;
                    default:
                        // ignore \( and \), if mismatched will get mathJax error
                        break;
                }
            } else {
                // openTag is (
                switch (tag) {
                    case "[":
                    case "(":
                        repMismatch();
                        resynch();
                        break;
                    case "]":
                        repMismatch();
                        // into text mode
                        openTag = false;
                        break;
                    default:
                        // )
                        await writeOut();
                        break;
                }
            }
        }
    }
    if (openTag) {
        reportError(`no end tag for \\${openTag} at line ${openLine}`);
    }
    // copy remaining text
    toBuffer(textIn.slice(startIndex));
    writeFileSync(outFile, textOut);
    console.log("Finished");
}
