package fixture.accessors;

// Exercises the accessor filter for `trim` paired with `split`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccTrim {

    private Probe24 probe;

    public void holds1() {
        probe.trim();
        probe.split();
    }

    public void holds2() {
        probe.trim();
        probe.split();
    }

    public void holds3() {
        probe.trim();
        probe.split();
    }

    public void holds4() {
        probe.trim();
        probe.split();
    }

    public void deviates() {
        probe.trim();
    }
}
