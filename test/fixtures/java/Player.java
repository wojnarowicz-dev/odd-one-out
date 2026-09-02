package fixture;

import javafx.scene.media.MediaPlayer;

// Three methods release the player the same way. The fourth stops it and walks
// away — that is the planted deviation.
public class Player {

    private MediaPlayer player;

    public void openFirst(String url) {
        player.stop();
        player.dispose();
    }

    public void openSecond(String url) {
        player.stop();
        player.dispose();
    }

    public void openThird(String url) {
        player.stop();
        player.dispose();
    }

    public void openFourth(String url) {
        player.stop();
    }
}
