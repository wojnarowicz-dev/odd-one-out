package fixture.accessors;

// Exercises the accessor filter for `size` paired with `length`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccSize {

    private Probe0 probe;

    public void holds1() {
        probe.size();
        probe.length();
    }

    public void holds2() {
        probe.size();
        probe.length();
    }

    public void holds3() {
        probe.size();
        probe.length();
    }

    public void holds4() {
        probe.size();
        probe.length();
    }

    public void deviates() {
        probe.size();
    }
}
