package fixture.io;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

// The shared layer over the file system.
public class Fs {

    public static List<String> readAllLinesSafe(Path p) throws IOException {
        return Files.readAllLines(p);
    }
}
