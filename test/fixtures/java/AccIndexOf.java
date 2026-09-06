package fixture.accessors;

// Exercises the accessor filter for `indexOf` paired with `lastIndexOf`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccIndexOf {

    private Probe5 probe;

    public void holds1() {
        probe.indexOf();
        probe.lastIndexOf();
    }

    public void holds2() {
        probe.indexOf();
        probe.lastIndexOf();
    }

    public void holds3() {
        probe.indexOf();
        probe.lastIndexOf();
    }

    public void holds4() {
        probe.indexOf();
        probe.lastIndexOf();
    }

    public void deviates() {
        probe.indexOf();
    }
}
