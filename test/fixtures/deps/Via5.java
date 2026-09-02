package fixture;

import fixture.io.Fs;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

public class Via5 {

    public List<String> load(Path p) throws IOException {
        return Fs.readAllLinesSafe(p);
    }
}
