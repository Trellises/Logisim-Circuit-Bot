// Inside the Claude artifact viewer, plain download links are blocked, so the
// save goes through the viewer's `downloads` capability. That only accepts
// certain extensions, so other files get ".txt" appended there.
const VIEWER_EXTENSIONS = /\.(txt|json|md|csv|html|svg)$/i;

export async function downloadText(filename, text, type = 'text/xml') {
    const viewerDownloads = await window.claude?.use?.('downloads');
    if (viewerDownloads) {
        const name = VIEWER_EXTENSIONS.test(filename) ? filename : `${filename}.txt`;
        await viewerDownloads.save({ filename: name, data: text }); // rejects {code} on decline/failure
        return { filename: name };
    }

    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { filename };
}
