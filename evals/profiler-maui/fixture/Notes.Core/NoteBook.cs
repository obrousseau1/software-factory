namespace Notes.Core;

public class NoteBook
{
    private readonly List<string> _notes = [];

    public void Add(string note) => _notes.Add(note);

    public string Summary() => $"{_notes.Count} notes";
}
