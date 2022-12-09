# m2svg
This command-line tool processes a text file (usually html) which includes LaTex maths formulae. It makes an image for each formula which it places in a directory named 'images'. It produces another file where each formula is replaced by a link to an image.

## Installation
First, nodejs and npm must be installed on your computer. The procedure varies with the operating system:

For Linux, nodejs and npm can be installed from the distribution.

For Windows, download and run the installer from https://nodejs.org.

For Mac, ?

It is then necessary to open a command prompt:--
In windows, in the list of programs that appear when you click on the windows icon, there will be a Node.js folder and within it the Node.js command prompt; this is the one to use.
In Linux the normal terminal will work.

In the command window type:

`npm install -g m2svg`

## Use
The tool is run from a command prompt console. Make a directory where you want to work and place the file you want to convert in it.

In the command window navigate to the working directory and type:

`m2svg infile outfile`

where `infile` is the file to convert and `outfile` will be the converted file. The image files will be placed in a subdirectory of the working directory called "images". This directory will be created if it does not already exist.

The program will normally run until the conversion is complete. It prints dots to show its progress. Pressing ctrl-c will stop the run.

In the converted file the maths expressions, delimited by the tags `\[` and `\]` for 'display' expressions or `\(` and `\)` for 'inline' expressions, are replaced by `<img>` links.

The 'data-tex' attribute will contain the original maths expression.

If the program detects any tags that do not match up correctly it will print a message at the terminal showing the number of the line where the error occurred and continue working.

## Notes
### Images
The tool makes SVG images using Mathjax. The names of the images will be a serial number. Any duplicated expressions will link to the same image.

The display images are centre-aligned horizontally. This is done by css. The html (or associated css file) should include something like the following:

```css
<style>
.align-center {
    display: block;
    text-align: center;
    margin-top: 0.3em;
}
</style>
```
The vertical space above and below the image can be adjusted by changing margin-top and margin-bottom.

### Reversion
An application is available to revert the file with image links back to its original form.

### Limitations
Some markup will not produce a usable image including: \tag{}. For tagged expressions you can use \text markup suitably spaced.
The \multline markup will generate a multi-line image. But since we do not know at this stage the width of the device where the file will be displayed a width of around 1000 pixels is assumed. If this is not satisfactory \multline could be simulated using \aligned or \gather with \quad or other spacing.