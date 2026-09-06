package fixture.accessors;

// Exercises the accessor filter for `substring` paired with `trim`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccSubstring {

    private Probe23 probe;

    public void holds1() {
        probe.substring();
        probe.trim();
    }

    public void holds2() {
        probe.substring();
        probe.trim();
    }

    public void holds3() {
        probe.substring();
        probe.trim();
    }

    public void holds4() {
        probe.substring();
        probe.trim();
    }

    public void deviates() {
        probe.substring();
    }
}
