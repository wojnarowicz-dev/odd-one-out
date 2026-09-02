package fixture;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

// Planted deviation: goes to java.nio directly instead of through fixture.io.Fs.
public class Direct2 {

    public List<String> load(Path p) throws IOException {
        return Files.readAllLines(p);
    }
}
