using System;
using Microsoft.WindowsAPICodePack.Dialogs;

internal static class FolderPickerProgram
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            var initial = args.Length > 0 ? args[0] : "";
            var title = args.Length > 1 ? args[1] : "Select folder";
            var path = FolderPicker.Pick(title, initial);
            if (!string.IsNullOrEmpty(path))
                Console.WriteLine(path);
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.ToString());
            return 1;
        }
    }
}

internal static class FolderPicker
{
    internal static string Pick(string title, string initialPath)
    {
        var dialog = new CommonOpenFileDialog
        {
            IsFolderPicker = true,
            EnsurePathExists = true,
            Title = title,
        };
        if (!string.IsNullOrEmpty(initialPath))
            dialog.InitialDirectory = initialPath;

        return dialog.ShowDialog() == CommonFileDialogResult.Ok ? dialog.FileName : null;
    }
}
