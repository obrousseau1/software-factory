using Notes.Core;

namespace Notes.App;

public partial class MainPage : ContentPage
{
    public MainPage()
    {
        InitializeComponent();
        Count.Text = new NoteBook().Summary();
    }
}
