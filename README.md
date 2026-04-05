# m2svg
This command-line tool processes a text file (usually html) which includes LaTex maths formulae. It converts the formulae into a representation of the math in one of three different ways: as svg images, as inline svg, or as MathML. It also makes a text represntation of the maths which can be used by screen-readers.

## Installation
First, nodejs and npm must be installed on your computer. The procedure varies with the operating system:

For Linux, nodejs and npm can be installed from the distribution.

For Windows, download and run the installer from https://nodejs.org.

For macOS, either:
* Use Homebrew to `brew install node`, or,
* Download and run the macOS installer from https://nodejs.org as mentioned above.

If you install using the nodejs installer, you will probably have to use sudo with `npm install`, as detailed below; the homebrew install should not require sudo.

It is then necessary to open a command prompt:--
In windows 10 click on the windows icon and a list of programs will appear. In windows 11, click on the windows icon and in the box which then appears click "All Apps" to see the list. In the list there will be a Node.js folder and within it the Node.js command prompt; this is the one to use.
In Linux the normal terminal will work.

In the command window type:

`npm install -g m2svg`

## Use
The tool is run from a command prompt console. Make a directory where you want to work and place the file you want to convert in it.
The file should also contain a line `__style_holder` inside the `<style>` section of the header. This will be replaced by css appropriate to the mode in use.

In the command window navigate to the working directory and type:

`m2svg -i infile -o outfile -m mode -g margin -l langcode`

-m, -g, -l are optional.

`infile` is the file to convert. Must be specified.

`outfile` will be the converted file. Must be specified.

`mode` is one of `i` for embedded images, `s` for inline svg, `m` for MathML or `d` for a dummy run. If not specified the default is `i`.

`margin` specifies the space above and below display expressions in any css units. If not specified the default is `0.3em`

`langcode` specifies the language used for for the text representation of the maths as a two-letter code, see ISO 639-1. If not specified the default is `en`.

In the case of mode `i` the image files will be placed in a subdirectory of the working directory called "images". This directory will be created if it does not already exist.

The program will normally run until the conversion is complete. It prints dots to show its progress. Pressing ctrl-c will stop the run.
In the converted file the maths expressions, delimited by the tags `\[` and `\]` for 'display' expressions or `\(` and `\)` for 'inline' expressions, are replaced in the output file by the appropriate text or links. These will contain a 'data-tex' attribute which shows the original maths expression.

If the program detects any tags that do not match up correctly it will print a message at the terminal showing the number of the line where the error occurred and continue working. If there are any errors in the math expressions then a message will be printed to the console describing the error and the number of the line near where it occurs.

### Reversion

There is a `reverse` option which will convert the processed file back to its original form. type:

`m2svg -i infile -o outfile -r`

(This does not change the css inserted in the header)

### Updating
On subsequent occasions, to ensure you have the latest version of m2svg type `npm update -g m2svg`

### Additional Features
Within a math expression the following macros are implemented:

`\reflect{...}` gives a reversed character. E.g. `\(x = \reflect{\mathrm{D}}\)`.

`\rotate{...}` gives a character rotated by 180 degrees. E.g. `\(x = \rotate{\mathrm{R}}\)`.

`scale{...}{...}` stretches a character by a scale factor. E.g. `\(x = \scale{3}{▶}\)` makes the triangle 3 times longer.

## Comparison of the modes

### Dummy run
This does not produce any output but just checks that the tags `\[`, `\]`, `\(` and `\)` are correctly matched and reports any errors.

### Image mode
This works with most browsers and ereaders.
The names of the images will be a serial number. Results in a large file size for the images. Any duplicated expressions will link to the same image which helps to keep the size down .
Some markup will not produce a usable image including: \tag{}. For tagged expressions you can use \text markup suitably spaced.
The \multline markup will generate a multi-line image. But since we do not know at this stage the width of the device where the file will be displayed a width of around 1000 pixels is assumed. If this is not satisfactory \multline could be simulated using \aligned or \gather with \quad or other spacing.

### Inline svg mode
This works with most browsers and ereaders. \tag{} markup will work even on old ereaders to make a label placed near the right margin. The file size will be large, even more than the image mode because duplicated expressions will result in duplicated inline svg.

### MathML mode
Support for this is limited. Firefox is quite good, other browsers less so. \tag{} markup doesn't currently work in Firefox or Chromium. MathML works well in the Calibre epub viewer even with \tag{}. An advantage is small file size.
