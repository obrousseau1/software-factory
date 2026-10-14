using Notes.Core;

public class NoteBookTests
{
    [Fact]
    public void CountsNotes()
    {
        var book = new NoteBook();
        book.Add("milk");
        Assert.Equal("1 notes", book.Summary());
    }
}
